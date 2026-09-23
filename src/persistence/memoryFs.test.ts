import { describe, expect, it } from "vitest";
import { joinPath } from "./fs";
import { MemoryFs } from "./memoryFs";

describe("joinPath", () => {
  it("junta partes sem barras duplicadas", () => {
    expect(joinPath("/data/", "backups", "a.json")).toBe("/data/backups/a.json");
  });
});

describe("MemoryFs", () => {
  it("lê, grava, renomeia, lista, remove e informa mtime crescente", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/d");
    await fs.writeText("/d/a.txt", "1");
    const first = await fs.mtime("/d/a.txt");
    await fs.rename("/d/a.txt", "/d/b.txt");
    expect(await fs.exists("/d/a.txt")).toBe(false);
    expect(await fs.readText("/d/b.txt")).toBe("1");
    expect(await fs.mtime("/d/b.txt")).toBeGreaterThan(first);
    await fs.writeText("/d/sub/c.txt", "2");
    expect(await fs.list("/d")).toEqual(["b.txt"]);
    await fs.remove("/d/b.txt");
    expect(await fs.exists("/d/b.txt")).toBe(false);
    expect(await fs.exists("/d")).toBe(true);
  });

  it("falha leitura de arquivo inexistente e gravação quando failWrites", async () => {
    const fs = new MemoryFs();
    await expect(fs.readText("/x")).rejects.toThrow("ENOENT");
    fs.failWrites = true;
    await expect(fs.writeText("/x", "1")).rejects.toThrow("EIO");
  });
});
