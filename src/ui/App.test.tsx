// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryFs } from "../persistence/memoryFs";
import { createAgendaStore } from "../store/agendaStore";
import { createAppStore } from "../store/appStore";
import { fakeCalendarService, fakeClock, memoryAgendaCache, memorySettings } from "../store/testing";
import { App } from "./App";
import { AppProvider } from "./context";
import { fakePlatform } from "./testing";

afterEach(cleanup);

async function renderApp(fs: MemoryFs, options: { dir?: string; pickFolder?: () => Promise<string | null> } = {}) {
  const store = createAppStore({ fs, settings: memorySettings(options.dir ?? null), clock: fakeClock(), debounceMs: 60_000 });
  const agenda = createAgendaStore({
    service: fakeCalendarService(),
    settings: memorySettings(),
    cache: memoryAgendaCache(),
    clock: fakeClock(),
  });
  const platform = fakePlatform(options.pickFolder ? { pickFolder: vi.fn(options.pickFolder) } : {});
  render(
    <AppProvider store={store} agenda={agenda} platform={platform}>
      <App />
    </AppProvider>,
  );
  await act(() => store.getState().boot());
  return { store, platform, user: userEvent.setup() };
}

describe("App", () => {
  it("primeira abertura: escolhe a pasta e fica pronto", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/novo");
    const { store, user } = await renderApp(fs, { pickFolder: async () => "/novo" });
    await user.click(screen.getByRole("button", { name: "Escolher pasta" }));
    await waitFor(() => expect(store.getState().phase).toBe("ready"));
    expect(await fs.exists("/novo/kamban.json")).toBe(true);
  });

  it("cancelar a escolha de pasta não muda nada", async () => {
    const fs = new MemoryFs();
    const { store, user } = await renderApp(fs, { pickFolder: async () => null });
    await user.click(screen.getByRole("button", { name: "Escolher pasta" }));
    expect(store.getState().phase).toBe("choose-folder");
  });

  it("arquivo corrompido: mostra o erro e restaura o backup", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    const seedFs = new MemoryFs();
    await seedFs.mkdir("/data");
    const seeded = createAppStore({ fs: seedFs, settings: memorySettings(), clock: fakeClock() });
    await seeded.getState().openFolder("/data");
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", await seedFs.readText("/data/kamban.json"));
    await fs.writeText("/data/kamban.json", "{ quebrado");

    const { store, user } = await renderApp(fs, { dir: "/data" });
    expect(screen.getByText("Não foi possível abrir seus dados")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Restaurar último backup" }));
    await waitFor(() => expect(store.getState().phase).toBe("ready"));
    expect(await screen.findByText(/kamban-2026-09-22.json restaurado/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(screen.queryByText(/restaurado/)).toBeNull();
  });

  it("versão futura não oferece restauração", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    await fs.writeText("/data/kamban.json", JSON.stringify({ version: 99 }));
    await renderApp(fs, { dir: "/data" });
    expect(screen.getByText("Este arquivo é de uma versão mais nova do Kamban")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restaurar último backup" })).toBeNull();
  });
});
