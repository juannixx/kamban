import { describe, expect, it } from "vitest";
import { getBoard } from "../domain/boards";
import { getCard } from "../domain/cards";
import { isHabitDone } from "../domain/habits";
import { MemoryFs } from "../persistence/memoryFs";
import { parseData } from "../persistence/load";
import { saveData, serialize } from "../persistence/save";
import { createAppStore, type AppDeps } from "./appStore";
import { fakeClock, memorySettings } from "./testing";

const DIR = "/data";

async function setup(options: { dir?: string | null; debounceMs?: number } = {}) {
  const fs = new MemoryFs();
  await fs.mkdir(DIR);
  const clock = fakeClock();
  const settings = memorySettings(options.dir === undefined ? null : options.dir);
  const deps: AppDeps = { fs, settings, clock, debounceMs: options.debounceMs ?? 1 };
  const store = createAppStore(deps);
  return { fs, clock, settings, store, state: () => store.getState() };
}

async function readFile(fs: MemoryFs) {
  const result = parseData(await fs.readText("/data/kamban.json"));
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

describe("boot e abertura de pasta", () => {
  it("sem pasta salva vai para a escolha de pasta", async () => {
    const { state } = await setup();
    await state().boot();
    expect(state().phase).toBe("choose-folder");
  });

  it("pasta vazia: cria o arquivo com o quadro To-do, lembra a pasta e fica pronto", async () => {
    const { fs, settings, state } = await setup();
    await state().openFolder(DIR);
    expect(state().phase).toBe("ready");
    expect(state().dataDir).toBe(DIR);
    expect(settings.current).toBe(DIR);
    expect(getBoard(state().data, "id-1").name).toBe("To-do");
    expect((await readFile(fs)).boards).toHaveLength(1);
    expect(state().view).toEqual({ type: "today" });
  });

  it("boot com pasta salva abre essa pasta", async () => {
    const { state } = await setup({ dir: DIR });
    await state().boot();
    expect(state().phase).toBe("ready");
  });

  it("pasta inexistente volta para a escolha com aviso", async () => {
    const { state } = await setup();
    await state().openFolder("/sumiu");
    expect(state().phase).toBe("choose-folder");
    expect(state().notice).toContain("/sumiu");
  });

  it("arquivo corrompido vai para load-error sem sobrescrever o arquivo", async () => {
    const { fs, state } = await setup();
    await fs.writeText("/data/kamban.json", "{ quebrado");
    await state().openFolder(DIR);
    expect(state().phase).toBe("load-error");
    expect(state().loadError?.error).toBe("invalid-json");
    expect(await fs.readText("/data/kamban.json")).toBe("{ quebrado");
  });
});

describe("restoreBackup", () => {
  it("restaura o backup válido e fica pronto", async () => {
    const { fs, state } = await setup();
    const good = await (async () => {
      const temp = await setup();
      await temp.state().openFolder(DIR);
      return temp.state().data;
    })();
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", serialize(good));
    await fs.writeText("/data/kamban.json", "{ quebrado");
    await state().openFolder(DIR);
    await state().restoreBackup();
    expect(state().phase).toBe("ready");
    expect(state().data).toEqual(good);
    expect(state().notice).toContain("kamban-2026-09-22.json");
  });

  it("sem backup válido mantém o erro e avisa", async () => {
    const { fs, state } = await setup();
    await fs.writeText("/data/kamban.json", "{ quebrado");
    await state().openFolder(DIR);
    await state().restoreBackup();
    expect(state().phase).toBe("load-error");
    expect(state().notice).toBe("Nenhum backup válido encontrado.");
  });
});

describe("alterações e gravação", () => {
  it("altera na memória na hora e grava no flush", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    const id = state().addCard("id-1", "id-2", "Comprar pão");
    expect(id).toBe("id-5");
    expect(getCard(state().data, "id-5").title).toBe("Comprar pão");
    await state().flush();
    expect(getCard(await readFile(fs), "id-5").title).toBe("Comprar pão");
    expect(state().saveStatus).toBe("saved");
  });

  it("DomainError vira aviso e não agenda gravação", async () => {
    const { state } = await setup();
    await state().openFolder(DIR);
    expect(state().addCard("id-1", "id-2", "   ")).toBeNull();
    expect(state().notice).toBe("Título não pode ficar vazio.");
    expect(state().hasPendingChanges()).toBe(false);
    state().dismissNotice();
    expect(state().notice).toBeNull();
  });

  it("falha ao gravar marca lastSaveFailed até uma gravação dar certo", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    fs.failWrites = true;
    state().addBoard("Casa");
    await state().flush();
    expect(state().saveStatus).toBe("error");
    expect(state().lastSaveFailed).toBe(true);

    state().renameBoard("id-1", "Tarefas");
    expect(state().saveStatus).toBe("pending");
    expect(state().lastSaveFailed).toBe(true);

    fs.failWrites = false;
    await state().onFocus();
    expect(state().lastSaveFailed).toBe(false);
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Tarefas");
  });

  it("checklist, hábitos e navegação", async () => {
    const { clock, state } = await setup();
    await state().openFolder(DIR);
    const cardId = state().addCard("id-1", "id-2", "Mala")!;
    expect(state().addChecklistItem(cardId, "Carregador")).toBe(true);
    const itemId = getCard(state().data, cardId).checklist[0]!.id;
    state().toggleChecklistItem(cardId, itemId);
    expect(getCard(state().data, cardId).checklist[0]!.done).toBe(true);

    state().addHabit("Água", { type: "daily" });
    const habitId = state().data.habits[0]!.id;
    state().toggleHabit(habitId);
    expect(isHabitDone(state().data, habitId, "2026-09-23")).toBe(true);
    clock.setToday("2026-09-24");
    state().refreshToday();
    expect(state().today).toBe("2026-09-24");
    state().toggleHabit(habitId);
    expect(isHabitDone(state().data, habitId, "2026-09-24")).toBe(true);

    state().setView({ type: "board", boardId: "id-1" });
    state().openCard(cardId);
    expect(state().selectedCardId).toBe(cardId);
    state().archiveCard(cardId);
    expect(state().selectedCardId).toBeNull();
    state().archiveBoard("id-1");
    expect(state().view).toEqual({ type: "today" });
  });
});

describe("alteração externa do arquivo", () => {
  async function externalEdit(fs: MemoryFs, name: string) {
    const current = await readFile(fs);
    const edited = { ...current, boards: current.boards.map((b) => ({ ...b, name })) };
    await saveData(fs, DIR, edited, "2026-09-23");
  }

  it("sem edições pendentes recarrega do disco ao ganhar foco", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    await externalEdit(fs, "Do outro Mac");
    await state().onFocus();
    expect(getBoard(state().data, "id-1").name).toBe("Do outro Mac");
    expect(state().conflict).toBe(false);
  });

  it("com edições pendentes pergunta; 'disk' descarta as do app", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Do app");
    await externalEdit(fs, "Do disco");
    await state().onFocus();
    expect(state().conflict).toBe(true);
    await state().resolveConflict("disk");
    expect(state().conflict).toBe(false);
    expect(getBoard(state().data, "id-1").name).toBe("Do disco");
    expect(state().hasPendingChanges()).toBe(false);
  });

  it("'app' grava a versão do app por cima", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Do app");
    await externalEdit(fs, "Do disco");
    await state().onFocus();
    await state().resolveConflict("app");
    expect(state().conflict).toBe(false);
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do app");
  });

  it("a própria gravação do app não conta como alteração externa", async () => {
    const { state } = await setup();
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Meu");
    await state().flush();
    await state().onFocus();
    expect(state().conflict).toBe(false);
    expect(getBoard(state().data, "id-1").name).toBe("Meu");
  });
});
