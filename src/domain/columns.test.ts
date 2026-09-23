import { describe, expect, it } from "vitest";
import { createInitialData, getBoard } from "./boards";
import { addCard, cardsInColumn, getCard } from "./cards";
import { addColumn, boardColumns, removeColumn, renameColumn, reorderColumns, setDoneColumn } from "./columns";
import { DomainError } from "./errors";
import type { KambanData } from "./schema";
import { LATER, NOW } from "./testing";

function base(): KambanData {
  return createInitialData({ id: "b1", columnIds: ["c-todo", "c-doing", "c-done"] });
}

const names = (data: KambanData) => boardColumns(getBoard(data, "b1")).map((c) => c.name);

describe("addColumn / renameColumn / reorderColumns", () => {
  it("adiciona no fim, renomeia e reordena", () => {
    let data = addColumn(base(), { boardId: "b1", id: "c-wait", name: " Aguardando " });
    expect(names(data)).toEqual(["A fazer", "Fazendo", "Feito", "Aguardando"]);
    data = renameColumn(data, "b1", "c-wait", "Bloqueado");
    data = reorderColumns(data, "b1", ["c-todo", "c-wait", "c-doing", "c-done"]);
    expect(names(data)).toEqual(["A fazer", "Bloqueado", "Fazendo", "Feito"]);
  });

  it("rejeita nome vazio", () => {
    expect(() => addColumn(base(), { boardId: "b1", id: "x", name: "" })).toThrow(DomainError);
    expect(() => renameColumn(base(), "b1", "c-todo", " ")).toThrow(DomainError);
  });
});

describe("setDoneColumn", () => {
  it("troca a coluna isDone e ajusta completedAt dos cartões do quadro", () => {
    let data = addCard(base(), { id: "k1", boardId: "b1", columnId: "c-done", title: "Feito antes", now: NOW });
    data = addCard(data, { id: "k2", boardId: "b1", columnId: "c-doing", title: "Em andamento", now: NOW });
    data = setDoneColumn(data, "b1", "c-doing", LATER);

    const flags = boardColumns(getBoard(data, "b1")).map((c) => [c.id, c.isDone]);
    expect(flags).toEqual([["c-todo", false], ["c-doing", true], ["c-done", false]]);
    expect(getCard(data, "k1").completedAt).toBeUndefined();
    expect(getCard(data, "k2").completedAt).toBe(LATER);
  });
});

describe("removeColumn", () => {
  it("remove coluna vazia", () => {
    const data = removeColumn(base(), { boardId: "b1", columnId: "c-doing", now: NOW });
    expect(names(data)).toEqual(["A fazer", "Feito"]);
  });

  it("exige destino quando a coluna tem cartões", () => {
    const data = addCard(base(), { id: "k1", boardId: "b1", columnId: "c-doing", title: "X", now: NOW });
    expect(() => removeColumn(data, { boardId: "b1", columnId: "c-doing", now: NOW })).toThrow(DomainError);
    expect(() =>
      removeColumn(data, { boardId: "b1", columnId: "c-doing", moveCardsTo: "c-doing", now: NOW }),
    ).toThrow(DomainError);
  });

  it("move os cartões para o fim do destino, preservando a ordem, e ajusta completedAt", () => {
    let data = addCard(base(), { id: "k0", boardId: "b1", columnId: "c-done", title: "Z", now: NOW });
    data = addCard(data, { id: "k1", boardId: "b1", columnId: "c-doing", title: "A", now: NOW });
    data = addCard(data, { id: "k2", boardId: "b1", columnId: "c-doing", title: "B", now: NOW });
    data = removeColumn(data, { boardId: "b1", columnId: "c-doing", moveCardsTo: "c-done", now: LATER });

    expect(cardsInColumn(data, "c-done").map((c) => c.id)).toEqual(["k0", "k1", "k2"]);
    expect(getCard(data, "k1")).toMatchObject({ completedAt: LATER, updatedAt: LATER });
  });

  it("não permite remover a coluna isDone", () => {
    expect(() => removeColumn(base(), { boardId: "b1", columnId: "c-done", now: NOW })).toThrow(DomainError);
  });
});
