import { describe, expect, it } from "vitest";
import { createInitialData } from "../../domain/boards";
import { addCard, cardsInColumn, moveCard } from "../../domain/cards";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { cardDndId, columnDndId, parseDndId, resolveCardDrop, resolveColumnDrop } from "./dnd";

// Colunas: c1 (A fazer: A, B, C), c2 (Fazendo: X), c3 (Feito)
function data(): KambanData {
  let d = createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });
  for (const [id, columnId] of [["A", "c1"], ["B", "c1"], ["C", "c1"], ["X", "c2"]] as const) {
    d = addCard(d, { id, boardId: "b1", columnId, title: id, now: NOW });
  }
  return d;
}

function applyDrop(d: KambanData, cardId: string, overId: string) {
  const drop = resolveCardDrop(d, cardId, overId);
  if (!drop) return d;
  return moveCard(d, { cardId, toColumnId: drop.toColumnId, toIndex: drop.toIndex, now: NOW });
}
const titles = (d: KambanData, columnId: string) => cardsInColumn(d, columnId).map((c) => c.id);

describe("ids do arrastar e soltar", () => {
  it("codifica e decodifica", () => {
    expect(parseDndId(cardDndId("A"))).toEqual({ type: "card", id: "A" });
    expect(parseDndId(columnDndId("c1"))).toEqual({ type: "column", id: "c1" });
    expect(parseDndId("outro")).toBeNull();
  });
});

describe("resolveCardDrop", () => {
  it("dentro da mesma coluna, para baixo e para cima", () => {
    expect(titles(applyDrop(data(), "A", cardDndId("C")), "c1")).toEqual(["B", "C", "A"]);
    expect(titles(applyDrop(data(), "C", cardDndId("A")), "c1")).toEqual(["C", "A", "B"]);
  });

  it("sobre um cartão de outra coluna entra antes dele", () => {
    const d = applyDrop(data(), "A", cardDndId("X"));
    expect(titles(d, "c2")).toEqual(["A", "X"]);
    expect(titles(d, "c1")).toEqual(["B", "C"]);
  });

  it("sobre a área da coluna vai para o fim", () => {
    expect(titles(applyDrop(data(), "A", columnDndId("c2")), "c2")).toEqual(["X", "A"]);
    expect(titles(applyDrop(data(), "A", columnDndId("c3")), "c3")).toEqual(["A"]);
  });

  it("sem alvo ou sobre si mesmo não faz nada", () => {
    expect(resolveCardDrop(data(), "A", null)).toBeNull();
    expect(resolveCardDrop(data(), "A", cardDndId("A"))).toBeNull();
    expect(resolveCardDrop(data(), "A", "outro")).toBeNull();
  });
});

describe("resolveColumnDrop", () => {
  it("move a coluna para a posição do alvo (coluna ou cartão dela)", () => {
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c1", columnDndId("c3"))).toEqual(["c2", "c3", "c1"]);
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c3", cardDndId("A"))).toEqual(["c3", "c1", "c2"]);
  });

  it("sem alvo ou sobre si mesma não faz nada", () => {
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c1", null)).toBeNull();
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c1", columnDndId("c1"))).toBeNull();
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c1", cardDndId("B"))).toBeNull();
  });
});
