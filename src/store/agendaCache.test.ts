import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgendaCache } from "../domain/agenda";
import { MemoryFs } from "../persistence/memoryFs";
import { createFileAgendaCache } from "./agendaCache";

const cache: AgendaCache = {
  date: "2026-09-24",
  accounts: { a1: { fetchedAt: "2026-09-24T09:00:00.000Z", items: [] } },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFileAgendaCache", () => {
  it("grava e lê de volta, criando a pasta", async () => {
    const fs = new MemoryFs();
    const store = createFileAgendaCache(fs, "/cache/kamban");
    expect(await store.read()).toBeNull();
    await store.write(cache);
    expect(await fs.exists("/cache/kamban")).toBe(true);
    expect(await store.read()).toEqual(cache);
  });

  it("arquivo inválido vira null", async () => {
    const fs = new MemoryFs();
    await fs.writeText("/cache/calendar-cache.json", "{ quebrado");
    expect(await createFileAgendaCache(fs, "/cache").read()).toBeNull();
  });

  it("falha ao gravar não lança erro", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fs = new MemoryFs();
    fs.failWrites = true;
    await expect(createFileAgendaCache(fs, "/cache").write(cache)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
