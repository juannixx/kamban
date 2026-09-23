import { describe, expect, it } from "vitest";
import {
  activeBoards,
  addBoard,
  archiveBoard,
  createEmptyData,
  createInitialData,
  getBoard,
  getDoneColumn,
  renameBoard,
  reorderBoards,
} from "./boards";
import { DomainError } from "./errors";
import { kambanDataSchema } from "./schema";

const ids = { id: "b1", columnIds: ["c1", "c2", "c3"] as [string, string, string] };

describe("createInitialData", () => {
  it("cria um quadro To-do com as três colunas padrão e dados válidos", () => {
    const data = createInitialData(ids);
    expect(data.boards).toHaveLength(1);
    const board = data.boards[0]!;
    expect(board.name).toBe("To-do");
    expect(board.columns.map((c) => [c.name, c.isDone])).toEqual([
      ["A fazer", false],
      ["Fazendo", false],
      ["Feito", true],
    ]);
    expect(kambanDataSchema.safeParse(data).success).toBe(true);
  });
});

describe("addBoard", () => {
  it("adiciona ao final com order seguinte e nome sem espaços nas pontas", () => {
    const data = addBoard(createInitialData(ids), {
      id: "b2",
      name: "  Casa ",
      columnIds: ["d1", "d2", "d3"],
    });
    expect(data.boards[1]).toMatchObject({ id: "b2", name: "Casa", order: 1, archived: false });
  });

  it("rejeita nome vazio", () => {
    expect(() =>
      addBoard(createEmptyData(), { id: "b2", name: "   ", columnIds: ["d1", "d2", "d3"] }),
    ).toThrow(DomainError);
  });
});

describe("renameBoard / archiveBoard / reorderBoards / activeBoards", () => {
  it("renomeia, arquiva e reordena", () => {
    let data = addBoard(createInitialData(ids), { id: "b2", name: "Casa", columnIds: ["d1", "d2", "d3"] });
    data = addBoard(data, { id: "b3", name: "Projeto X", columnIds: ["e1", "e2", "e3"] });
    data = renameBoard(data, "b1", "Tarefas");
    data = reorderBoards(data, ["b3", "b1", "b2"]);
    data = archiveBoard(data, "b2");

    expect(getBoard(data, "b1").name).toBe("Tarefas");
    expect(activeBoards(data).map((b) => b.id)).toEqual(["b3", "b1"]);
  });

  it("lança DomainError para quadro inexistente", () => {
    expect(() => renameBoard(createEmptyData(), "nope", "X")).toThrow(DomainError);
  });
});

describe("getDoneColumn", () => {
  it("retorna a coluna isDone", () => {
    const board = getBoard(createInitialData(ids), "b1");
    expect(getDoneColumn(board).id).toBe("c3");
  });
});
