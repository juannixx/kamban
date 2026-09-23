import { getBoard, getColumn, updateBoard } from "./boards";
import { withCompletion } from "./cards";
import { DomainError, requireText } from "./errors";
import { applyOrder, byOrder, nextOrder } from "./order";
import type { Board, Column, KambanData } from "./schema";

export function boardColumns(board: Board): Column[] {
  return [...board.columns].sort(byOrder);
}

export function addColumn(data: KambanData, input: { boardId: string; id: string; name: string }): KambanData {
  const name = requireText(input.name, "Nome da coluna");
  return updateBoard(data, input.boardId, (b) => ({
    ...b,
    columns: [...b.columns, { id: input.id, name, order: nextOrder(b.columns), isDone: false }],
  }));
}

export function renameColumn(data: KambanData, boardId: string, columnId: string, name: string): KambanData {
  const trimmed = requireText(name, "Nome da coluna");
  getColumn(getBoard(data, boardId), columnId);
  return updateBoard(data, boardId, (b) => ({
    ...b,
    columns: b.columns.map((c) => (c.id === columnId ? { ...c, name: trimmed } : c)),
  }));
}

export function reorderColumns(data: KambanData, boardId: string, orderedIds: readonly string[]): KambanData {
  return updateBoard(data, boardId, (b) => ({ ...b, columns: applyOrder(b.columns, orderedIds) }));
}

export function setDoneColumn(data: KambanData, boardId: string, columnId: string, now: string): KambanData {
  getColumn(getBoard(data, boardId), columnId);
  const next = updateBoard(data, boardId, (b) => ({
    ...b,
    columns: b.columns.map((c) => ({ ...c, isDone: c.id === columnId })),
  }));
  return {
    ...next,
    cards: next.cards.map((card) =>
      card.boardId === boardId ? withCompletion(card, card.columnId === columnId, now) : card,
    ),
  };
}

export function removeColumn(
  data: KambanData,
  input: { boardId: string; columnId: string; moveCardsTo?: string; now: string },
): KambanData {
  const board = getBoard(data, input.boardId);
  const column = getColumn(board, input.columnId);
  if (column.isDone) {
    throw new DomainError("A coluna de concluídos não pode ser removida. Marque outra coluna como concluída antes.");
  }

  let cards = data.cards;
  const affected = data.cards.filter((c) => c.columnId === column.id).sort(byOrder);
  if (affected.length > 0) {
    if (!input.moveCardsTo || input.moveCardsTo === column.id) {
      throw new DomainError("Escolha outra coluna para receber os cartões desta coluna.");
    }
    const target = getColumn(board, input.moveCardsTo);
    let order = nextOrder(data.cards.filter((c) => c.columnId === target.id));
    const moved = new Map(
      affected.map((c) => [
        c.id,
        withCompletion({ ...c, columnId: target.id, order: order++, updatedAt: input.now }, target.isDone, input.now),
      ]),
    );
    cards = data.cards.map((c) => moved.get(c.id) ?? c);
  }

  return updateBoard({ ...data, cards }, input.boardId, (b) => ({
    ...b,
    columns: b.columns.filter((c) => c.id !== column.id),
  }));
}
