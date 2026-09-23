import { beforeEach, describe, expect, it } from "vitest";
import { createInitialData, renameBoard } from "../domain/boards";
import { addCard, updateCard } from "../domain/cards";
import { backupName, listBackups, rotateBackups } from "./backups";
import { MemoryFs } from "./memoryFs";
import { saveData, serialize } from "./save";

const DIR = "/data";
const initial = () => createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });

let fs: MemoryFs;
beforeEach(async () => {
  fs = new MemoryFs();
  await fs.mkdir(DIR);
});

describe("saveData", () => {
  it("grava via arquivo temporário e não deixa o .tmp para trás", async () => {
    const mtime = await saveData(fs, DIR, initial(), "2026-09-23");
    expect(await fs.readText("/data/kamban.json")).toBe(serialize(initial()));
    expect(await fs.exists("/data/kamban.json.tmp")).toBe(false);
    expect(mtime).toBe(await fs.mtime("/data/kamban.json"));
  });

  it("mantém o arquivo anterior intacto se a gravação falhar", async () => {
    await saveData(fs, DIR, initial(), "2026-09-23");
    fs.failWrites = true;
    await expect(saveData(fs, DIR, renameBoard(initial(), "b1", "Outro"), "2026-09-23")).rejects.toThrow();
    expect(await fs.readText("/data/kamban.json")).toBe(serialize(initial()));
  });

  it("na primeira gravação do dia copia o arquivo atual para backups, só uma vez por dia", async () => {
    await saveData(fs, DIR, initial(), "2026-09-23"); // não havia arquivo: sem backup
    expect(await listBackups(fs, DIR)).toEqual([]);

    const v2 = renameBoard(initial(), "b1", "V2");
    await saveData(fs, DIR, v2, "2026-09-23");
    expect(await listBackups(fs, DIR)).toEqual(["kamban-2026-09-23.json"]);
    expect(await fs.readText("/data/backups/kamban-2026-09-23.json")).toBe(serialize(initial()));

    await saveData(fs, DIR, renameBoard(initial(), "b1", "V3"), "2026-09-23");
    expect(await fs.readText("/data/backups/kamban-2026-09-23.json")).toBe(serialize(initial()));

    await saveData(fs, DIR, initial(), "2026-09-24");
    expect(await listBackups(fs, DIR)).toEqual(["kamban-2026-09-24.json", "kamban-2026-09-23.json"]);
  });

  it("recusa gravar dados que não passam no schema e não altera o arquivo existente", async () => {
    await saveData(fs, DIR, initial(), "2026-09-23");

    const withCard = addCard(initial(), {
      id: "card1",
      boardId: "b1",
      columnId: "c1",
      title: "Tarefa",
      now: "2026-09-23T00:00:00.000Z",
    });
    const invalid = updateCard(withCard, "card1", { dueDate: "" }, "2026-09-23T00:00:00.000Z");

    await expect(saveData(fs, DIR, invalid, "2026-09-23")).rejects.toThrow();
    expect(await fs.readText("/data/kamban.json")).toBe(serialize(initial()));
    expect(await fs.exists("/data/kamban.json.tmp")).toBe(false);
  });

  it("recusa gravar dados inválidos quando ainda não existe arquivo (não cria nada)", async () => {
    const withCard = addCard(initial(), {
      id: "card1",
      boardId: "b1",
      columnId: "c1",
      title: "Tarefa",
      now: "2026-09-23T00:00:00.000Z",
    });
    const invalid = updateCard(withCard, "card1", { dueDate: "" }, "2026-09-23T00:00:00.000Z");

    await expect(saveData(fs, DIR, invalid, "2026-09-23")).rejects.toThrow();
    expect(await fs.exists("/data/kamban.json")).toBe(false);
  });
});

describe("rotateBackups", () => {
  it("mantém só os 14 mais recentes e ignora arquivos com outro nome", async () => {
    for (let day = 1; day <= 16; day++) {
      await fs.writeText(`/data/backups/${backupName(`2026-09-${String(day).padStart(2, "0")}`)}`, "{}");
    }
    await fs.writeText("/data/backups/notas.txt", "x");
    await fs.mkdir("/data/backups");
    await rotateBackups(fs, DIR);

    const names = await listBackups(fs, DIR);
    expect(names).toHaveLength(14);
    expect(names[0]).toBe("kamban-2026-09-16.json");
    expect(names.at(-1)).toBe("kamban-2026-09-03.json");
    expect(await fs.exists("/data/backups/notas.txt")).toBe(true);
  });
});
