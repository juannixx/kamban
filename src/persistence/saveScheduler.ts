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
  let disposed = false;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function startTimer(ms: number) {
    if (disposed) return;
    clearTimer();
    timer = setTimeout(() => {
      void run();
    }, ms);
  }

  /** Isola exceções de onStatus: um onStatus que lança nunca derruba o agendador. */
  function emit(status: SaveStatus) {
    try {
      onStatus(status);
    } catch {
      // ignorado de propósito: falha do observador não é falha da gravação.
    }
  }

  async function run(): Promise<void> {
    if (disposed) return;
    clearTimer();
    while (running) await running;
    if (disposed || !dirty) return;

    dirty = false;
    emit("saving");
    const current: Promise<void> = Promise.resolve()
      .then(save)
      .then(
        () => {
          emit(dirty ? "pending" : "saved");
        },
        () => {
          dirty = true;
          emit("error");
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
      if (disposed) return;
      dirty = true;
      emit("pending");
      startTimer(debounceMs);
    },
    flush: run,
    hasPendingChanges: () => dirty || running !== null,
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
