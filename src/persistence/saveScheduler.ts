export type SaveStatus = "saved" | "pending" | "saving" | "error";

export interface SaveSchedulerOptions {
  save: () => Promise<void>;
  onStatus?: (status: SaveStatus) => void;
  debounceMs?: number;
  retryMs?: number;
}

export interface SaveScheduler {
  /** Marca que há mudanças e agenda a gravação (debounce). */
  schedule(): void;
  /** Grava agora se houver mudanças, esperando gravações em andamento. Não lança erro. */
  flush(): Promise<void>;
  hasPendingChanges(): boolean;
  dispose(): void;
}

export function createSaveScheduler({
  save,
  onStatus = () => {},
  debounceMs = 500,
  retryMs = 5000,
}: SaveSchedulerOptions): SaveScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let running: Promise<void> | null = null;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function startTimer(ms: number) {
    clearTimer();
    timer = setTimeout(() => {
      void run();
    }, ms);
  }

  async function run(): Promise<void> {
    clearTimer();
    while (running) await running;
    if (!dirty) return;

    dirty = false;
    onStatus("saving");
    const current: Promise<void> = save()
      .then(
        () => {
          onStatus(dirty ? "pending" : "saved");
        },
        () => {
          dirty = true;
          onStatus("error");
          startTimer(retryMs);
        },
      )
      .finally(() => {
        if (running === current) running = null;
      });
    running = current;
    await current;
  }

  return {
    schedule() {
      dirty = true;
      onStatus("pending");
      startTimer(debounceMs);
    },
    flush: run,
    hasPendingChanges: () => dirty || running !== null,
    dispose: clearTimer,
  };
}
