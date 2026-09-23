import { describe, expect, it } from "vitest";
import { getBoard } from "../domain/boards";
import { getCard } from "../domain/cards";
import { isHabitDone } from "../domain/habits";
import { listBackups } from "../persistence/backups";
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

async function externalEdit(fs: MemoryFs, name: string) {
  const current = await readFile(fs);
  const edited = { ...current, boards: current.boards.map((b) => ({ ...b, name })) };
  await saveData(fs, DIR, edited, "2026-09-23");
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

describe("proteções contra perda de dados", () => {
  it("conflito congela a gravação", async () => {
    const { fs, state } = await setup({ debounceMs: 1 });
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Do app");
    await externalEdit(fs, "Do disco");
    await state().flush();
    expect(state().conflict).toBe(true);
    expect(state().lastSaveFailed).toBe(true);

    await new Promise((r) => setTimeout(r, 30));
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do disco");

    expect(state().renameBoard("id-1", "Outro")).toBe(false);
    expect(state().notice).toBe("Resolva o conflito do arquivo antes de continuar editando.");

    await state().resolveConflict("disk");
    expect(getBoard(state().data, "id-1").name).toBe("Do disco");
    expect(state().saveStatus).toBe("saved");
    expect(state().lastSaveFailed).toBe(false);
  });

  it("a gravação detecta alteração externa mesmo sem passar por onFocus", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    await externalEdit(fs, "Do disco");
    state().renameBoard("id-1", "Do app");
    await state().flush();
    expect(state().conflict).toBe(true);
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do disco");
  });

  it("resolveConflict('app') grava a versão do app por cima após detecção na gravação", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    await externalEdit(fs, "Do disco");
    state().renameBoard("id-1", "Do app");
    await state().flush();
    expect(state().conflict).toBe(true);

    await state().resolveConflict("app");
    expect(state().conflict).toBe(false);
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do app");
  });

  it("onFocus depois de uma gravação que falhou verifica o disco antes de tentar de novo", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    fs.failWrites = true;
    state().renameBoard("id-1", "Tentativa");
    await state().flush();
    expect(state().saveStatus).toBe("error");

    fs.failWrites = false;
    await externalEdit(fs, "Do disco");
    await state().onFocus();
    expect(state().conflict).toBe(true);
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do disco");
  });

  it("trocar de pasta com gravação falhando não perde as alterações", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Não salvo");
    fs.failWrites = true;
    await fs.mkdir("/outra");

    await state().openFolder("/outra");
    expect(state().dataDir).toBe(DIR);
    expect(state().phase).toBe("ready");
    expect(getBoard(state().data, "id-1").name).toBe("Não salvo");
    expect(state().notice).toBe(
      "Não foi possível salvar as alterações na pasta atual. A troca de pasta foi cancelada.",
    );
  });

  it("restoreBackup fora da tela de erro não faz nada", async () => {
    const { state } = await setup();
    await state().openFolder(DIR);
    const before = state().data;
    await state().restoreBackup();
    expect(state().data).toEqual(before);
    expect(state().notice).toBeNull();
  });

  it("falha ao lembrar a pasta não trava o app em 'booting'", async () => {
    const fs = new MemoryFs();
    await fs.mkdir(DIR);
    const clock = fakeClock();
    const settings = {
      getDataDir: async () => null,
      setDataDir: async () => {
        throw new Error("disco cheio");
      },
    };
    const deps: AppDeps = { fs, settings, clock, debounceMs: 1 };
    const store = createAppStore(deps);

    await store.getState().openFolder(DIR);
    expect(store.getState().phase).toBe("ready");
    expect(store.getState().notice).toContain("Não foi possível lembrar a pasta escolhida");
  });

  it("duas onFocus seguidas durante um conflito não resolvem sozinhas a favor do disco", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Do app");
    await externalEdit(fs, "Do disco");
    await state().onFocus();
    expect(state().conflict).toBe(true);

    await state().onFocus();
    expect(state().conflict).toBe(true);
    expect(getBoard(state().data, "id-1").name).toBe("Do app");
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do disco");
  });

  it("hasPendingChanges() continua verdadeiro durante um conflito", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Do app");
    await externalEdit(fs, "Do disco");
    await state().onFocus();
    expect(state().conflict).toBe(true);
    expect(state().hasPendingChanges()).toBe(true);
  });

  it("trocar de pasta durante um conflito é cancelado", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Do app");
    await externalEdit(fs, "Do disco");
    await state().onFocus();
    expect(state().conflict).toBe(true);

    await state().openFolder("/outra");
    expect(state().dataDir).toBe(DIR);
    expect(state().conflict).toBe(true);
    expect(state().notice).toBe(
      "Não foi possível salvar as alterações na pasta atual. A troca de pasta foi cancelada.",
    );
  });
});

describe("falhas inesperadas de I/O ao abrir", () => {
  it("openFolder com exists() lançando erro volta para a escolha de pasta com aviso", async () => {
    const { fs, state } = await setup();
    fs.exists = async () => {
      throw new Error("forbidden path");
    };
    await state().openFolder("/Volumes/X");
    expect(state().phase).toBe("choose-folder");
    expect(state().notice).toBe("Não foi possível abrir a pasta /Volumes/X: Error: forbidden path");
    expect(state().hasPendingChanges()).toBe(false);
  });

  it("boot com a leitura da pasta salva falhando volta para a escolha de pasta com aviso", async () => {
    const fs = new MemoryFs();
    const settings = {
      getDataDir: async (): Promise<string | null> => {
        throw new Error("store corrompido");
      },
      setDataDir: async () => {},
    };
    const store = createAppStore({ fs, settings, clock: fakeClock(), debounceMs: 1 });
    await store.getState().boot();
    expect(store.getState().phase).toBe("choose-folder");
    expect(store.getState().notice).toContain("store corrompido");
  });
});

describe("kamban.json ausente numa pasta que já tem dados", () => {
  it("com backups não cria um quadro vazio: vai para load-error e o backup pode ser restaurado", async () => {
    const { fs, state } = await setup();
    const good = await (async () => {
      const temp = await setup();
      await temp.state().openFolder(DIR);
      temp.state().renameBoard("id-1", "Meus dados");
      return temp.state().data;
    })();
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", serialize(good));

    await state().openFolder(DIR);
    expect(state().phase).toBe("load-error");
    expect(state().dataDir).toBe(DIR);
    expect(state().loadError?.error).toBe("missing-with-backups");
    expect(state().loadError?.message).toBe(
      "O kamban.json não está nesta pasta, mas existem backups. Se a pasta está no iCloud, o arquivo pode ainda não ter sido baixado: abra a pasta no Finder, espere o download e tente de novo, ou restaure o último backup.",
    );
    expect(await fs.exists("/data/kamban.json")).toBe(false);

    await state().restoreBackup();
    expect(state().phase).toBe("ready");
    expect(getBoard(state().data, "id-1").name).toBe("Meus dados");
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Meus dados");
  });

  it("com o marcador do iCloud (.kamban.json.icloud) não cria um quadro vazio", async () => {
    const { fs, state } = await setup();
    await fs.writeText("/data/.kamban.json.icloud", "");
    await state().openFolder(DIR);
    expect(state().phase).toBe("load-error");
    expect(state().loadError?.error).toBe("missing-with-backups");
    expect(await fs.exists("/data/kamban.json")).toBe(false);
  });
});

describe("resolveConflict guarda uma cópia da versão descartada", () => {
  async function inConflict() {
    const ctx = await setup({ debounceMs: 60_000 });
    await ctx.state().openFolder(DIR);
    ctx.state().renameBoard("id-1", "Do app");
    await externalEdit(ctx.fs, "Do disco");
    await ctx.state().onFocus();
    expect(ctx.state().conflict).toBe(true);
    return ctx;
  }
  const COPY = "/data/backups/kamban-conflito-2026-09-23T12-00-00Z.json";

  async function readCopy(fs: MemoryFs) {
    const result = parseData(await fs.readText(COPY));
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }

  it("'app': a versão do disco vai para backups/ antes de ser sobrescrita", async () => {
    const { fs, state } = await inConflict();
    await state().resolveConflict("app");
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do app");
    expect(getBoard(await readCopy(fs), "id-1").name).toBe("Do disco");
  });

  it("'disk': a versão do app vai para backups/ antes de ser descartada", async () => {
    const { fs, state } = await inConflict();
    await state().resolveConflict("disk");
    expect(getBoard(state().data, "id-1").name).toBe("Do disco");
    expect(getBoard(await readCopy(fs), "id-1").name).toBe("Do app");
  });

  it("o nome da cópia não entra na rotação dos backups diários", async () => {
    const { fs, state } = await inConflict();
    await state().resolveConflict("disk");
    expect(await listBackups(fs, DIR)).not.toContain("kamban-conflito-2026-09-23T12-00-00Z.json");
  });

  it("se não conseguir guardar a cópia, avisa e o conflito continua", async () => {
    const { fs, state } = await inConflict();
    fs.failWrites = true;
    await state().resolveConflict("disk");
    expect(state().conflict).toBe(true);
    expect(getBoard(state().data, "id-1").name).toBe("Do app");
    expect(state().notice).toContain("Não foi possível guardar uma cópia da outra versão");

    await state().resolveConflict("app");
    expect(state().conflict).toBe(true);
    fs.failWrites = false;
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do disco");
  });
});

describe("recarregar do disco", () => {
  it("fecha o cartão aberto para o painel não ficar com um rascunho antigo", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    const cardId = state().addCard("id-1", "id-2", "Cartão")!;
    await state().flush();
    state().openCard(cardId);
    await externalEdit(fs, "Do outro Mac");
    await state().onFocus();
    expect(getBoard(state().data, "id-1").name).toBe("Do outro Mac");
    expect(state().selectedCardId).toBeNull();
  });
});
