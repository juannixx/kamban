import { describe, expect, it } from "vitest";
import { createInitialData } from "../domain/boards";
import { loadData, migrate, parseData } from "./load";
import { MemoryFs } from "./memoryFs";

const initial = () => createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });

describe("parseData", () => {
  it("aceita JSON válido", () => {
    const result = parseData(JSON.stringify(initial()));
    expect(result).toEqual({ ok: true, data: initial() });
  });

  it("identifica JSON quebrado", () => {
    expect(parseData("{ nope")).toMatchObject({ ok: false, error: "invalid-json" });
  });

  it("identifica schema inválido com mensagem", () => {
    const result = parseData(JSON.stringify({ ...initial(), boards: "x" }));
    expect(result).toMatchObject({ ok: false, error: "invalid-schema" });
    if (!result.ok) expect(result.message).not.toBe("");
  });

  it("recusa versão mais nova que a suportada", () => {
    expect(parseData(JSON.stringify({ ...initial(), version: 99 }))).toMatchObject({
      ok: false,
      error: "future-version",
    });
  });
});

describe("migrate", () => {
  it("aplica as migrações em sequência até a versão atual", () => {
    const migrations = {
      1: (raw: Record<string, unknown>) => ({ ...raw, version: 2, a: true }),
      2: (raw: Record<string, unknown>) => ({ ...raw, version: 3, b: true }),
    };
    expect(migrate({ version: 1 }, migrations, 3)).toEqual({ version: 3, a: true, b: true });
  });

  it("devolve o valor como está quando não há versão numérica", () => {
    expect(migrate("x")).toBe("x");
    expect(migrate({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("loadData", () => {
  it("retorna no-folder, missing, ok e error conforme o estado da pasta", async () => {
    const fs = new MemoryFs();
    expect(await loadData(fs, "/d")).toEqual({ status: "no-folder" });

    await fs.mkdir("/d");
    expect(await loadData(fs, "/d")).toEqual({ status: "missing" });

    await fs.writeText("/d/kamban.json", JSON.stringify(initial()));
    const ok = await loadData(fs, "/d");
    expect(ok).toEqual({ status: "ok", data: initial(), mtime: await fs.mtime("/d/kamban.json") });

    await fs.writeText("/d/kamban.json", "{");
    expect(await loadData(fs, "/d")).toMatchObject({ status: "error", error: "invalid-json" });
  });

  it("retorna read-failed em vez de lançar quando a leitura do arquivo falha", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/d");
    await fs.writeText("/d/kamban.json", JSON.stringify(initial()));
    fs.failReads.add("/d/kamban.json");

    expect(await loadData(fs, "/d")).toMatchObject({ status: "error", error: "read-failed" });
  });
});
