import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs } from "../persistence/memoryFs";
import { createAppStore } from "../store/appStore";
import { fakeClock, memorySettings } from "../store/testing";
import { attachWindowLifecycle, type LifecycleWindow } from "./windowLifecycle";

function fakeWindow() {
  let close: ((event: { preventDefault(): void }) => Promise<void>) | undefined;
  let focus: ((event: { payload: boolean }) => void) | undefined;
  const win: LifecycleWindow = {
    onCloseRequested: async (handler) => {
      close = handler;
    },
    onFocusChanged: async (handler) => {
      focus = handler;
    },
  };
  return {
    win,
    async requestClose() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      await close?.(event);
      return event.prevented;
    },
    focus: (payload: boolean) => focus?.({ payload }),
  };
}

async function readyStore(fs: MemoryFs) {
  await fs.mkdir("/data");
  const clock = fakeClock();
  const store = createAppStore({ fs, settings: memorySettings(), clock, debounceMs: 60_000 });
  await store.getState().openFolder("/data");
  return { store, clock };
}

let stop: () => void = () => {};
afterEach(() => stop());

describe("attachWindowLifecycle", () => {
  it("ao fechar grava o que falta e deixa fechar", async () => {
    const fs = new MemoryFs();
    const { store } = await readyStore(fs);
    const w = fakeWindow();
    const confirmClose = vi.fn(async () => true);
    stop = await attachWindowLifecycle(store, w.win, confirmClose);
    store.getState().renameBoard("id-1", "Antes de fechar");
    expect(await w.requestClose()).toBe(false);
    expect(await fs.readText("/data/kamban.json")).toContain("Antes de fechar");
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it("se a gravação falhar pergunta, e cancela o fechamento quando o usuário recusa", async () => {
    const fs = new MemoryFs();
    const { store } = await readyStore(fs);
    const w = fakeWindow();
    const confirmClose = vi.fn(async () => false);
    stop = await attachWindowLifecycle(store, w.win, confirmClose);
    fs.failWrites = true;
    store.getState().renameBoard("id-1", "Não salvo");
    expect(await w.requestClose()).toBe(true);
    expect(confirmClose).toHaveBeenCalledOnce();
  });

  it("ao ganhar foco chama onFocus", async () => {
    const fs = new MemoryFs();
    const { store } = await readyStore(fs);
    const w = fakeWindow();
    const onFocus = vi.spyOn(store.getState(), "onFocus");
    stop = await attachWindowLifecycle(store, w.win, async () => true);
    w.focus(false);
    expect(onFocus).not.toHaveBeenCalled();
    w.focus(true);
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it("ao perder o foco grava o que falta", async () => {
    const fs = new MemoryFs();
    const { store } = await readyStore(fs);
    const w = fakeWindow();
    const commitDrafts = vi.fn();
    stop = await attachWindowLifecycle(store, w.win, async () => true, 60_000, commitDrafts);
    store.getState().renameBoard("id-1", "Trocou de app");
    w.focus(false);
    expect(commitDrafts).toHaveBeenCalledOnce();
    await vi.waitFor(async () => expect(await fs.readText("/data/kamban.json")).toContain("Trocou de app"));
  });

  it("ao fechar confirma os rascunhos antes de gravar", async () => {
    const fs = new MemoryFs();
    const { store } = await readyStore(fs);
    const w = fakeWindow();
    const confirmClose = vi.fn(async () => true);
    const commitDrafts = vi.fn(() => {
      store.getState().renameBoard("id-1", "Rascunho digitado");
    });
    stop = await attachWindowLifecycle(store, w.win, confirmClose, 60_000, commitDrafts);
    expect(await w.requestClose()).toBe(false);
    expect(commitDrafts).toHaveBeenCalledOnce();
    expect(await fs.readText("/data/kamban.json")).toContain("Rascunho digitado");
    expect(confirmClose).not.toHaveBeenCalled();
  });

  describe("virada do dia", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("atualiza o today periodicamente", async () => {
      const fs = new MemoryFs();
      const { store, clock } = await readyStore(fs);
      stop = await attachWindowLifecycle(store, fakeWindow().win, async () => true, 1000);
      clock.setToday("2026-09-24");
      await vi.advanceTimersByTimeAsync(1000);
      expect(store.getState().today).toBe("2026-09-24");
    });
  });
});
