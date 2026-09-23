import { describe, expect, it } from "vitest";
import { createInitialData } from "../../domain/boards";
import { addCard, cardsInColumn, moveCard } from "../../domain/cards";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { cardDndId, columnDndId, parseDndId, pickBoardCollision, resolveCardDrop, resolveColumnDrop } from "./dnd";

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

describe("pickBoardCollision", () => {
  const hit = (id: string) => ({ id });
  const ids = (hits: { id: string }[]) => hits.map((h) => h.id);
  const never = () => {
    throw new Error("não devia usar o fallback");
  };

  it("cartão: o ponteiro sobre um cartão ganha da coluna em volta", () => {
    const hits = [hit(columnDndId("c2")), hit(cardDndId("X"))];
    expect(ids(pickBoardCollision("card", hits, never))).toEqual([cardDndId("X")]);
  });

  it("cartão: o ponteiro só sobre a coluna escolhe a coluna (solta no fim)", () => {
    expect(ids(pickBoardCollision("card", [hit(columnDndId("c3"))], never))).toEqual([columnDndId("c3")]);
  });

  it("cartão: o ponteiro fora de tudo usa o fallback", () => {
    const fallback = () => [hit(cardDndId("B")), hit(columnDndId("c1"))];
    expect(ids(pickBoardCollision("card", [], fallback))).toEqual([cardDndId("B"), columnDndId("c1")]);
  });

  it("coluna: só considera colunas, na ordem do fallback", () => {
    const fallback = () => [hit(cardDndId("A")), hit(columnDndId("c2")), hit(cardDndId("X")), hit(columnDndId("c1"))];
    expect(ids(pickBoardCollision("column", [hit(cardDndId("A"))], fallback))).toEqual([
      columnDndId("c2"),
      columnDndId("c1"),
    ]);
  });
});
