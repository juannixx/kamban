// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupApp } from "../testing";
import { SettingsView } from "./SettingsView";

afterEach(cleanup);

describe("SettingsView", () => {
  it("mostra a pasta de dados e troca de pasta gravando antes", async () => {
    const { store, fs, user } = await setupApp(<SettingsView />, { platform: { pickFolder: vi.fn(async () => "/outra") } });
    await fs.mkdir("/outra");
    expect(screen.getByText("/data")).toBeTruthy();
    store.getState().renameBoard("id-1", "Antes da troca");
    await user.click(screen.getByRole("button", { name: "Trocar pasta" }));
    await waitFor(() => expect(store.getState().dataDir).toBe("/outra"));
    expect(await fs.readText("/data/kamban.json")).toContain("Antes da troca");
    expect(await fs.exists("/outra/kamban.json")).toBe(true);
  });

  it("abre a pasta de backups no Finder", async () => {
    const { user, platform } = await setupApp(<SettingsView />);
    await user.click(screen.getByRole("button", { name: "Abrir backups no Finder" }));
    await waitFor(() => expect(platform.revealFolder).toHaveBeenCalledWith("/data/backups"));
  });

  it("se não conseguir abrir, tenta a pasta de dados e depois avisa", async () => {
    const revealFolder = vi.fn(async () => {
      throw new Error("sem acesso");
    });
    const { store, user } = await setupApp(<SettingsView />, { platform: { revealFolder } });
    await user.click(screen.getByRole("button", { name: "Abrir backups no Finder" }));
    await waitFor(() => expect(store.getState().notice).toContain("Não foi possível abrir a pasta"));
    expect(revealFolder).toHaveBeenCalledWith("/data");
  });
});
