import { describe, expect, it } from "vitest";
import { createInitialData } from "./boards";
import {
  addCard,
  archiveCard,
  cardsInColumn,
  checklistProgress,
  completeCard,
  deleteCard,
  getCard,
  moveCard,
  updateCard,
} from "./cards";
import { DomainError } from "./errors";
import type { KambanData } from "./schema";
import { LATER, NOW } from "./testing";

// b1: c-todo (A fazer), c-doing (Fazendo), c-done (Feito, isDone)
function base(): KambanData {
  return createInitialData({ id: "b1", columnIds: ["c-todo", "c-doing", "c-done"] });
}

function withCards(...titles: string[]): KambanData {
  return titles.reduce(
    (data, title, i) =>
      addCard(data, { id: `k${i + 1}`, boardId: "b1", columnId: "c-todo", title, now: NOW }),
    base(),
  );
}

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe("addCard", () => {
  it("cria o cartão no fim da coluna, com checklist vazio e datas", () => {
    const data = withCards("A", "B");
    expect(getCard(data, "k2")).toMatchObject({
      title: "B",
      columnId: "c-todo",
      order: 1,
      checklist: [],
      archived: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(getCard(data, "k2").completedAt).toBeUndefined();
  });

  it("preenche completedAt quando criado na coluna isDone", () => {
    const data = addCard(base(), { id: "k1", boardId: "b1", columnId: "c-done", title: "X", now: NOW });
    expect(getCard(data, "k1").completedAt).toBe(NOW);
  });

  it("rejeita título vazio e coluna inexistente", () => {
    expect(() => addCard(base(), { id: "k1", boardId: "b1", columnId: "c-todo", title: " ", now: NOW })).toThrow(DomainError);
    expect(() => addCard(base(), { id: "k1", boardId: "b1", columnId: "nope", title: "X", now: NOW })).toThrow(DomainError);
  });
});

describe("updateCard", () => {
  it("aplica o patch, atualiza updatedAt e limpa campos com undefined", () => {
    let data = withCards("A");
    data = updateCard(data, "k1", { description: "**nota**", dueDate: "2026-09-30", priority: "high" }, NOW);
    data = updateCard(data, "k1", { priority: undefined, title: "  A2 " }, LATER);
    expect(getCard(data, "k1")).toMatchObject({ title: "A2", description: "**nota**", dueDate: "2026-09-30", updatedAt: LATER });
    expect(getCard(data, "k1").priority).toBeUndefined();
  });

  it("rejeita título vazio", () => {
    expect(() => updateCard(withCards("A"), "k1", { title: "" }, NOW)).toThrow(DomainError);
  });

  it("rejeita checklist undefined", () => {
    expect(() => updateCard(withCards("A"), "k1", { checklist: undefined }, NOW)).toThrow(DomainError);
  });
});

describe("moveCard", () => {
  it("reordena dentro da mesma coluna", () => {
    const data = moveCard(withCards("A", "B", "C"), { cardId: "k3", toColumnId: "c-todo", toIndex: 0, now: LATER });
    expect(ids(cardsInColumn(data, "c-todo"))).toEqual(["k3", "k1", "k2"]);
  });

  it("move para outra coluna na posição pedida, limitando o índice", () => {
    let data = withCards("A", "B", "C");
    data = moveCard(data, { cardId: "k1", toColumnId: "c-doing", toIndex: 0, now: LATER });
    data = moveCard(data, { cardId: "k2", toColumnId: "c-doing", toIndex: 99, now: LATER });
    expect(ids(cardsInColumn(data, "c-doing"))).toEqual(["k1", "k2"]);
    expect(ids(cardsInColumn(data, "c-todo"))).toEqual(["k3"]);
    expect(getCard(data, "k1").updatedAt).toBe(LATER);
  });

  it("preenche completedAt ao entrar em isDone e limpa ao sair", () => {
    let data = moveCard(withCards("A"), { cardId: "k1", toColumnId: "c-done", toIndex: 0, now: LATER });
    expect(getCard(data, "k1").completedAt).toBe(LATER);
    data = moveCard(data, { cardId: "k1", toColumnId: "c-todo", toIndex: 0, now: LATER });
    expect(getCard(data, "k1").completedAt).toBeUndefined();
  });

  it("rejeita coluna de outro quadro", () => {
    expect(() => moveCard(withCards("A"), { cardId: "k1", toColumnId: "nope", toIndex: 0, now: NOW })).toThrow(DomainError);
  });
});

describe("completeCard", () => {
  it("move para o fim da coluna isDone do quadro", () => {
    let data = addCard(withCards("A"), { id: "k9", boardId: "b1", columnId: "c-done", title: "Z", now: NOW });
    data = completeCard(data, "k1", LATER);
    expect(ids(cardsInColumn(data, "c-done"))).toEqual(["k9", "k1"]);
    expect(getCard(data, "k1").completedAt).toBe(LATER);
  });

  it("não altera cartão que já está concluído", () => {
    const data = addCard(base(), { id: "k1", boardId: "b1", columnId: "c-done", title: "Z", now: NOW });
    expect(completeCard(data, "k1", LATER)).toBe(data);
  });
});

describe("archiveCard / deleteCard / cardsInColumn", () => {
  it("arquivado some de cardsInColumn; excluído some dos dados", () => {
    let data = withCards("A", "B");
    data = archiveCard(data, "k1", LATER);
    expect(getCard(data, "k1")).toMatchObject({ archived: true, updatedAt: LATER });
    expect(ids(cardsInColumn(data, "c-todo"))).toEqual(["k2"]);
    data = deleteCard(data, "k2");
    expect(data.cards.map((c) => c.id)).toEqual(["k1"]);
    expect(() => deleteCard(data, "k2")).toThrow(DomainError);
  });
});

describe("checklistProgress", () => {
  it("conta itens feitos e total", () => {
    const data = updateCard(withCards("A"), "k1", {
      checklist: [
        { id: "i1", text: "um", done: true },
        { id: "i2", text: "dois", done: false },
      ],
    }, NOW);
    expect(checklistProgress(getCard(data, "k1"))).toEqual({ done: 1, total: 2 });
  });
});
