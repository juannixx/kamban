import { describe, expect, it } from "vitest";
import { createInitialData } from "../domain/boards";
import { listBackups } from "./backups";
import { MemoryFs } from "./memoryFs";
import { restoreLatestBackup } from "./restore";
import { serialize } from "./save";

const initial = () => createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });
const STAMP = "2026-09-23T12-00-00Z";

describe("restoreLatestBackup", () => {
  it("restaura o backup válido mais recente e coloca o arquivo atual em quarentena", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/kamban.json", "{ corrompido");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", serialize(initial()));
    await fs.writeText("/data/backups/kamban-2026-09-23.json", "{ também corrompido");

    const outcome = await restoreLatestBackup(fs, "/data", STAMP);

    expect(outcome).toMatchObject({ status: "ok", data: initial(), backup: "kamban-2026-09-22.json" });
    expect(await fs.readText("/data/kamban.json")).toBe(serialize(initial()));
    expect(await fs.readText(`/data/backups/kamban-quarentena-${STAMP}.json`)).toBe("{ corrompido");
    expect(await listBackups(fs, "/data")).toEqual(["kamban-2026-09-23.json", "kamban-2026-09-22.json"]);
  });

  it("não cria quarentena quando não havia arquivo atual", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", serialize(initial()));

    await restoreLatestBackup(fs, "/data", STAMP);

    expect(await fs.exists(`/data/backups/kamban-quarentena-${STAMP}.json`)).toBe(false);
  });

  it("retorna no-backup quando não há backup válido e não mexe em nada", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    await fs.writeText("/data/kamban.json", "{ corrompido");

    expect(await restoreLatestBackup(fs, "/data", STAMP)).toEqual({ status: "no-backup" });
    expect(await fs.readText("/data/kamban.json")).toBe("{ corrompido");
    expect(await fs.exists(`/data/backups/kamban-quarentena-${STAMP}.json`)).toBe(false);
  });

  it("pula um backup cuja leitura falha e tenta o próximo", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", serialize(initial()));
    await fs.writeText("/data/backups/kamban-2026-09-23.json", serialize(initial()));
    fs.failReads.add("/data/backups/kamban-2026-09-23.json");

    const outcome = await restoreLatestBackup(fs, "/data", STAMP);

    expect(outcome).toMatchObject({ status: "ok", data: initial(), backup: "kamban-2026-09-22.json" });
  });
});
