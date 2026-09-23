import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  rename: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
  stat: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => fsMock);

import { tauriFs } from "./tauriFs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tauriFs", () => {
  it("repassa leitura, escrita, rename e remove", async () => {
    fsMock.readTextFile.mockResolvedValue("conteúdo");
    expect(await tauriFs.readText("/d/a.json")).toBe("conteúdo");
    await tauriFs.writeText("/d/a.json", "x");
    expect(fsMock.writeTextFile).toHaveBeenCalledWith("/d/a.json", "x");
    await tauriFs.rename("/d/a", "/d/b");
    expect(fsMock.rename).toHaveBeenCalledWith("/d/a", "/d/b");
    await tauriFs.remove("/d/b");
    expect(fsMock.remove).toHaveBeenCalledWith("/d/b");
  });

  it("mkdir só cria se não existir, de forma recursiva", async () => {
    fsMock.exists.mockResolvedValueOnce(true);
    await tauriFs.mkdir("/d/backups");
    expect(fsMock.mkdir).not.toHaveBeenCalled();
    fsMock.exists.mockResolvedValueOnce(false);
    await tauriFs.mkdir("/d/backups");
    expect(fsMock.mkdir).toHaveBeenCalledWith("/d/backups", { recursive: true });
  });

  it("list devolve só nomes de arquivos", async () => {
    fsMock.readDir.mockResolvedValue([
      { name: "kamban-2026-09-23.json", isFile: true, isDirectory: false, isSymlink: false },
      { name: "sub", isFile: false, isDirectory: true, isSymlink: false },
    ]);
    expect(await tauriFs.list("/d/backups")).toEqual(["kamban-2026-09-23.json"]);
  });

  it("mtime converte Date para milissegundos e usa 0 quando não há data", async () => {
    fsMock.stat.mockResolvedValueOnce({ mtime: new Date(1_700_000_000_000) });
    expect(await tauriFs.mtime("/d/a")).toBe(1_700_000_000_000);
    fsMock.stat.mockResolvedValueOnce({ mtime: null });
    expect(await tauriFs.mtime("/d/a")).toBe(0);
  });
});
