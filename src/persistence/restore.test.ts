import { describe, expect, it } from "vitest";
import { createInitialData } from "../domain/boards";
import { MemoryFs } from "./memoryFs";
import { restoreLatestBackup } from "./restore";
import { serialize } from "./save";

const initial = () => createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });

describe("restoreLatestBackup", () => {
  it("restaura o backup válido mais recente sem gerar novo backup", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/kamban.json", "{ corrompido");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", serialize(initial()));
    await fs.writeText("/data/backups/kamban-2026-09-23.json", "{ também corrompido");

    const outcome = await restoreLatestBackup(fs, "/data");

    expect(outcome).toMatchObject({ status: "ok", data: initial(), backup: "kamban-2026-09-22.json" });
    expect(await fs.readText("/data/kamban.json")).toBe(serialize(initial()));
    expect((await fs.list("/data/backups")).sort()).toEqual(["kamban-2026-09-22.json", "kamban-2026-09-23.json"]);
  });

  it("retorna no-backup quando não há backup válido", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    expect(await restoreLatestBackup(fs, "/data")).toEqual({ status: "no-backup" });
  });
});
