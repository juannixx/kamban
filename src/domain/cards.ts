import { getBoard, getColumn, getDoneColumn } from "./boards";
import { DomainError, requireText } from "./errors";
import { byOrder, nextOrder } from "./order";
import type { Card, KambanData } from "./schema";

export interface NewCardInput {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  now: string;
}

/** Chave presente com valor `undefined` limpa o campo. */
export type CardPatch = Partial<Pick<Card, "title" | "description" | "dueDate" | "priority" | "checklist">>;

export interface MoveCardInput {
  cardId: string;
  toColumnId: string;
  toIndex: number;
  now: string;
}

/** Ajusta completedAt conforme o cartão está ou não na coluna de concluídos. */
export function withCompletion(card: Card, inDoneColumn: boolean, now: string): Card {
  if (inDoneColumn && !card.completedAt) return { ...card, completedAt: now };
  if (!inDoneColumn && card.completedAt) return { ...card, completedAt: undefined };
  return card;
}

export function getCard(data: KambanData, cardId: string): Card {
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) throw new DomainError(`Cartão não encontrado: ${cardId}`);
  return card;
}

function mapCard(data: KambanData, cardId: string, fn: (card: Card) => Card): KambanData {
  getCard(data, cardId);
  return { ...data, cards: data.cards.map((c) => (c.id === cardId ? fn(c) : c)) };
}

export function addCard(data: KambanData, input: NewCardInput): KambanData {
  const column = getColumn(getBoard(data, input.boardId), input.columnId);
  const card = withCompletion(
    {
      id: input.id,
      boardId: input.boardId,
      columnId: column.id,
      order: nextOrder(data.cards.filter((c) => c.columnId === column.id)),
      title: requireText(input.title, "Título"),
      checklist: [],
      archived: false,
      createdAt: input.now,
      updatedAt: input.now,
    },
    column.isDone,
    input.now,
  );
  return { ...data, cards: [...data.cards, card] };
}

export function updateCard(data: KambanData, cardId: string, patch: CardPatch, now: string): KambanData {
  const title = "title" in patch ? requireText(patch.title ?? "", "Título") : undefined;
  return mapCard(data, cardId, (c) => ({
    ...c,
    ...patch,
    ...(title !== undefined ? { title } : {}),
    updatedAt: now,
  }));
}

export function moveCard(data: KambanData, input: MoveCardInput): KambanData {
  const card = getCard(data, input.cardId);
  const target = getColumn(getBoard(data, card.boardId), input.toColumnId);
  const siblings = data.cards
    .filter((c) => c.columnId === target.id && !c.archived && c.id !== card.id)
    .sort(byOrder);
  const index = Math.max(0, Math.min(input.toIndex, siblings.length));
  const moved = withCompletion({ ...card, columnId: target.id, updatedAt: input.now }, target.isDone, input.now);
  const ordered = [...siblings.slice(0, index), moved, ...siblings.slice(index)];
  const byId = new Map(ordered.map((c, i) => [c.id, { ...c, order: i }]));
  return { ...data, cards: data.cards.map((c) => byId.get(c.id) ?? c) };
}

export function completeCard(data: KambanData, cardId: string, now: string): KambanData {
  const card = getCard(data, cardId);
  const done = getDoneColumn(getBoard(data, card.boardId));
  if (card.columnId === done.id) return data;
  return moveCard(data, { cardId, toColumnId: done.id, toIndex: Number.POSITIVE_INFINITY, now });
}

export function archiveCard(data: KambanData, cardId: string, now: string): KambanData {
  return mapCard(data, cardId, (c) => ({ ...c, archived: true, updatedAt: now }));
}

export function deleteCard(data: KambanData, cardId: string): KambanData {
  getCard(data, cardId);
  return { ...data, cards: data.cards.filter((c) => c.id !== cardId) };
}

export function cardsInColumn(data: KambanData, columnId: string): Card[] {
  return data.cards.filter((c) => c.columnId === columnId && !c.archived).sort(byOrder);
}

export function checklistProgress(card: Card): { done: number; total: number } {
  return { done: card.checklist.filter((i) => i.done).length, total: card.checklist.length };
}
