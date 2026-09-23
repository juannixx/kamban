import { createStore, type StoreApi } from "zustand/vanilla";
import { addBoard, archiveBoard, createEmptyData, createInitialData, renameBoard, reorderBoards } from "../domain/boards";
import {
  addCard,
  archiveCard,
  completeCard,
  deleteCard,
  getCard,
  moveCard,
  updateCard,
  type CardPatch,
} from "../domain/cards";
import {
  addChecklistItem,
  moveChecklistItem,
  removeChecklistItem,
  renameChecklistItem,
  toggleChecklistItem,
} from "../domain/checklist";
import { addColumn, removeColumn, renameColumn, reorderColumns, setDoneColumn } from "../domain/columns";
import { DomainError } from "../domain/errors";
import { addHabit, archiveHabit, reorderHabits, toggleHabit, updateHabit } from "../domain/habits";
import type { ChecklistItem, HabitSchedule, KambanData } from "../domain/schema";
import { DATA_FILE, joinPath, type FileSystem } from "../persistence/fs";
import { loadData, type LoadError } from "../persistence/load";
import { restoreLatestBackup } from "../persistence/restore";
import { saveData } from "../persistence/save";
import { createSaveScheduler, type SaveScheduler, type SaveStatus } from "../persistence/saveScheduler";

export interface Settings {
  getDataDir(): Promise<string | null>;
  setDataDir(dir: string): Promise<void>;
}

export interface Clock {
  /** Carimbo ISO 8601 para createdAt/updatedAt. */
  now(): string;
  /** Dia local "YYYY-MM-DD". */
  today(): string;
  /** Carimbo seguro para nome de arquivo. */
  stamp(): string;
  newId(): string;
}

export interface AppDeps {
  fs: FileSystem;
  settings: Settings;
  clock: Clock;
  debounceMs?: number;
  retryMs?: number;
}

export type View = { type: "today" } | { type: "habits" } | { type: "settings" } | { type: "board"; boardId: string };
export type Phase = "booting" | "choose-folder" | "load-error" | "ready";

export interface AppState {
  phase: Phase;
  dataDir: string | null;
  data: KambanData;
  loadError: { error: LoadError; message: string } | null;
  saveStatus: SaveStatus;
  /** Verdadeiro desde a última gravação que falhou até a próxima que der certo. */
  lastSaveFailed: boolean;
  /** O arquivo mudou fora do app enquanto havia edições não gravadas. */
  conflict: boolean;
  notice: string | null;
  today: string;
  view: View;
  selectedCardId: string | null;
}

export interface AppActions {
  boot(): Promise<void>;
  openFolder(dir: string): Promise<void>;
  restoreBackup(): Promise<void>;
  flush(): Promise<void>;
  hasPendingChanges(): boolean;
  onFocus(): Promise<void>;
  refreshToday(): void;
  resolveConflict(keep: "app" | "disk"): Promise<void>;
  showNotice(message: string): void;
  dismissNotice(): void;
  setView(view: View): void;
  openCard(cardId: string | null): void;

  addBoard(name: string): string | null;
  renameBoard(boardId: string, name: string): boolean;
  archiveBoard(boardId: string): boolean;
  reorderBoards(orderedIds: string[]): boolean;

  addColumn(boardId: string, name: string): boolean;
  renameColumn(boardId: string, columnId: string, name: string): boolean;
  setDoneColumn(boardId: string, columnId: string): boolean;
  removeColumn(boardId: string, columnId: string, moveCardsTo?: string): boolean;
  reorderColumns(boardId: string, orderedIds: string[]): boolean;

  addCard(boardId: string, columnId: string, title: string): string | null;
  updateCard(cardId: string, patch: CardPatch): boolean;
  moveCard(cardId: string, toColumnId: string, toIndex: number): boolean;
  completeCard(cardId: string): boolean;
  archiveCard(cardId: string): boolean;
  deleteCard(cardId: string): boolean;

  addChecklistItem(cardId: string, text: string): boolean;
  toggleChecklistItem(cardId: string, itemId: string): boolean;
  renameChecklistItem(cardId: string, itemId: string, text: string): boolean;
  removeChecklistItem(cardId: string, itemId: string): boolean;
  moveChecklistItem(cardId: string, itemId: string, delta: -1 | 1): boolean;

  addHabit(title: string, schedule: HabitSchedule): boolean;
  updateHabit(habitId: string, patch: { title?: string; schedule?: HabitSchedule }): boolean;
  archiveHabit(habitId: string): boolean;
  reorderHabits(orderedIds: string[]): boolean;
  toggleHabit(habitId: string): boolean;
}

export type AppStoreState = AppState & AppActions;
export type AppStore = StoreApi<AppStoreState>;

export function createAppStore(deps: AppDeps): AppStore {
  const { fs, settings, clock } = deps;
  let scheduler: SaveScheduler | null = null;
  /** mtime do kamban.json na última leitura ou gravação feita pelo app. */
  let lastMtime = 0;

  return createStore<AppStoreState>()((set, get) => {
    function stopScheduler() {
      scheduler?.dispose();
      scheduler = null;
    }

    function startScheduler(dir: string) {
      stopScheduler();
      scheduler = createSaveScheduler({
        debounceMs: deps.debounceMs,
        retryMs: deps.retryMs,
        save: async () => {
          lastMtime = await saveData(fs, dir, get().data, clock.today());
        },
        onStatus: (status) =>
          set((s) => ({
            saveStatus: status,
            lastSaveFailed: status === "error" ? true : status === "saved" ? false : s.lastSaveFailed,
          })),
      });
    }

    function becomeReady(dir: string, data: KambanData, mtime: number) {
      lastMtime = mtime;
      startScheduler(dir);
      set({
        phase: "ready",
        dataDir: dir,
        data,
        loadError: null,
        saveStatus: "saved",
        lastSaveFailed: false,
        conflict: false,
        today: clock.today(),
        view: { type: "today" },
        selectedCardId: null,
      });
    }

    function newBoardIds() {
      return { id: clock.newId(), columnIds: [clock.newId(), clock.newId(), clock.newId()] as [string, string, string] };
    }

    /** Aplica uma função do domínio; DomainError vira aviso. */
    function mutate(fn: (data: KambanData) => KambanData): boolean {
      if (get().phase !== "ready") return false;
      let next: KambanData;
      try {
        next = fn(get().data);
      } catch (error) {
        if (error instanceof DomainError) {
          set({ notice: error.message });
          return false;
        }
        throw error;
      }
      set({ data: next });
      scheduler?.schedule();
      return true;
    }

    function mutateChecklist(cardId: string, fn: (items: ChecklistItem[]) => ChecklistItem[]): boolean {
      return mutate((d) => updateCard(d, cardId, { checklist: fn(getCard(d, cardId).checklist) }, clock.now()));
    }

    async function reloadFromDisk(dir: string) {
      const outcome = await loadData(fs, dir);
      if (outcome.status === "ok") {
        lastMtime = outcome.mtime;
        set({ data: outcome.data, conflict: false });
      } else if (outcome.status === "error") {
        stopScheduler();
        set({ phase: "load-error", loadError: { error: outcome.error, message: outcome.message }, conflict: false });
      }
    }

    async function checkExternalChange() {
      const dir = get().dataDir;
      if (!dir || get().phase !== "ready" || get().saveStatus === "saving") return;
      let mtime: number;
      try {
        mtime = await fs.mtime(joinPath(dir, DATA_FILE));
      } catch {
        return;
      }
      if (mtime === lastMtime) return;
      if (scheduler?.hasPendingChanges()) {
        set({ conflict: true });
        return;
      }
      await reloadFromDisk(dir);
    }

    return {
      phase: "booting",
      dataDir: null,
      data: createEmptyData(),
      loadError: null,
      saveStatus: "saved",
      lastSaveFailed: false,
      conflict: false,
      notice: null,
      today: clock.today(),
      view: { type: "today" },
      selectedCardId: null,

      async boot() {
        const dir = await settings.getDataDir();
        if (!dir) {
          set({ phase: "choose-folder" });
          return;
        }
        await get().openFolder(dir);
      },

      async openFolder(dir) {
        await scheduler?.flush();
        stopScheduler();
        set({ phase: "booting" });
        const outcome = await loadData(fs, dir);
        switch (outcome.status) {
          case "no-folder":
            set({ phase: "choose-folder", notice: `Pasta não encontrada: ${dir}` });
            return;
          case "missing": {
            const data = createInitialData(newBoardIds());
            try {
              const mtime = await saveData(fs, dir, data, clock.today());
              await settings.setDataDir(dir);
              becomeReady(dir, data, mtime);
            } catch (error) {
              set({ phase: "choose-folder", notice: `Não foi possível criar o arquivo em ${dir}: ${String(error)}` });
            }
            return;
          }
          case "ok":
            await settings.setDataDir(dir);
            becomeReady(dir, outcome.data, outcome.mtime);
            return;
          case "error":
            await settings.setDataDir(dir);
            set({ phase: "load-error", dataDir: dir, loadError: { error: outcome.error, message: outcome.message } });
            return;
        }
      },

      async restoreBackup() {
        const dir = get().dataDir;
        if (!dir) return;
        try {
          const outcome = await restoreLatestBackup(fs, dir, clock.stamp());
          if (outcome.status === "no-backup") {
            set({ notice: "Nenhum backup válido encontrado." });
            return;
          }
          becomeReady(dir, outcome.data, outcome.mtime);
          set({ notice: `Backup ${outcome.backup} restaurado. O arquivo anterior foi guardado em backups/.` });
        } catch (error) {
          set({ notice: `Não foi possível restaurar o backup: ${String(error)}` });
        }
      },

      async flush() {
        await scheduler?.flush();
      },

      hasPendingChanges: () => scheduler?.hasPendingChanges() ?? false,

      async onFocus() {
        get().refreshToday();
        if (get().phase !== "ready") return;
        if (get().lastSaveFailed) await scheduler?.flush();
        await checkExternalChange();
      },

      refreshToday() {
        const today = clock.today();
        if (today !== get().today) set({ today });
      },

      async resolveConflict(keep) {
        const dir = get().dataDir;
        if (!dir) return;
        set({ conflict: false });
        if (keep === "app") {
          scheduler?.schedule();
          await scheduler?.flush();
          return;
        }
        startScheduler(dir);
        await reloadFromDisk(dir);
      },

      showNotice: (message) => set({ notice: message }),
      dismissNotice: () => set({ notice: null }),
      setView: (view) => set({ view, selectedCardId: null }),
      openCard: (cardId) => set({ selectedCardId: cardId }),

      addBoard(name) {
        const ids = newBoardIds();
        return mutate((d) => addBoard(d, { ...ids, name })) ? ids.id : null;
      },
      renameBoard: (boardId, name) => mutate((d) => renameBoard(d, boardId, name)),
      archiveBoard(boardId) {
        const ok = mutate((d) => archiveBoard(d, boardId));
        const view = get().view;
        if (ok && view.type === "board" && view.boardId === boardId) get().setView({ type: "today" });
        return ok;
      },
      reorderBoards: (orderedIds) => mutate((d) => reorderBoards(d, orderedIds)),

      addColumn: (boardId, name) => mutate((d) => addColumn(d, { boardId, id: clock.newId(), name })),
      renameColumn: (boardId, columnId, name) => mutate((d) => renameColumn(d, boardId, columnId, name)),
      setDoneColumn: (boardId, columnId) => mutate((d) => setDoneColumn(d, boardId, columnId, clock.now())),
      removeColumn: (boardId, columnId, moveCardsTo) =>
        mutate((d) => removeColumn(d, { boardId, columnId, moveCardsTo, now: clock.now() })),
      reorderColumns: (boardId, orderedIds) => mutate((d) => reorderColumns(d, boardId, orderedIds)),

      addCard(boardId, columnId, title) {
        const id = clock.newId();
        return mutate((d) => addCard(d, { id, boardId, columnId, title, now: clock.now() })) ? id : null;
      },
      updateCard: (cardId, patch) => mutate((d) => updateCard(d, cardId, patch, clock.now())),
      moveCard: (cardId, toColumnId, toIndex) =>
        mutate((d) => moveCard(d, { cardId, toColumnId, toIndex, now: clock.now() })),
      completeCard: (cardId) => mutate((d) => completeCard(d, cardId, clock.now())),
      archiveCard(cardId) {
        const ok = mutate((d) => archiveCard(d, cardId, clock.now()));
        if (ok && get().selectedCardId === cardId) set({ selectedCardId: null });
        return ok;
      },
      deleteCard(cardId) {
        const ok = mutate((d) => deleteCard(d, cardId));
        if (ok && get().selectedCardId === cardId) set({ selectedCardId: null });
        return ok;
      },

      addChecklistItem: (cardId, text) => mutateChecklist(cardId, (items) => addChecklistItem(items, clock.newId(), text)),
      toggleChecklistItem: (cardId, itemId) => mutateChecklist(cardId, (items) => toggleChecklistItem(items, itemId)),
      renameChecklistItem: (cardId, itemId, text) =>
        mutateChecklist(cardId, (items) => renameChecklistItem(items, itemId, text)),
      removeChecklistItem: (cardId, itemId) => mutateChecklist(cardId, (items) => removeChecklistItem(items, itemId)),
      moveChecklistItem: (cardId, itemId, delta) =>
        mutateChecklist(cardId, (items) => moveChecklistItem(items, itemId, delta)),

      addHabit: (title, schedule) => mutate((d) => addHabit(d, { id: clock.newId(), title, schedule, now: clock.now() })),
      updateHabit: (habitId, patch) => mutate((d) => updateHabit(d, habitId, patch)),
      archiveHabit: (habitId) => mutate((d) => archiveHabit(d, habitId)),
      reorderHabits: (orderedIds) => mutate((d) => reorderHabits(d, orderedIds)),
      toggleHabit: (habitId) => mutate((d) => toggleHabit(d, habitId, get().today)),
    };
  });
}
