import { DomainError, requireText } from "./errors";
import { applyOrder, byOrder, nextOrder } from "./order";
import { CURRENT_VERSION, type Board, type Column, type KambanData } from "./schema";

export interface NewBoardInput {
  id: string;
  name: string;
  columnIds: [string, string, string];
}

export function createEmptyData(): KambanData {
  return { version: CURRENT_VERSION, boards: [], cards: [], habits: [], habitLog: [] };
}

export function createInitialData(input: Omit<NewBoardInput, "name">): KambanData {
  return addBoard(createEmptyData(), { ...input, name: "To-do" });
}

export function addBoard(data: KambanData, input: NewBoardInput): KambanData {
  const [todo, doing, done] = input.columnIds;
  const board: Board = {
    id: input.id,
    name: requireText(input.name, "Nome do quadro"),
    order: nextOrder(data.boards),
    columns: [
      { id: todo, name: "A fazer", order: 0, isDone: false },
      { id: doing, name: "Fazendo", order: 1, isDone: false },
      { id: done, name: "Feito", order: 2, isDone: true },
    ],
    archived: false,
  };
  return { ...data, boards: [...data.boards, board] };
}

export function getBoard(data: KambanData, boardId: string): Board {
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) throw new DomainError(`Quadro não encontrado: ${boardId}`);
  return board;
}

export function getColumn(board: Board, columnId: string): Column {
  const column = board.columns.find((c) => c.id === columnId);
  if (!column) throw new DomainError(`Coluna não encontrada: ${columnId}`);
  return column;
}

export function getDoneColumn(board: Board): Column {
  const column = board.columns.find((c) => c.isDone);
  if (!column) throw new DomainError(`O quadro ${board.name} não tem coluna de concluídos.`);
  return column;
}

export function updateBoard(
  data: KambanData,
  boardId: string,
  fn: (board: Board) => Board,
): KambanData {
  getBoard(data, boardId);
  return { ...data, boards: data.boards.map((b) => (b.id === boardId ? fn(b) : b)) };
}

export function renameBoard(data: KambanData, boardId: string, name: string): KambanData {
  const trimmed = requireText(name, "Nome do quadro");
  return updateBoard(data, boardId, (b) => ({ ...b, name: trimmed }));
}

export function archiveBoard(data: KambanData, boardId: string): KambanData {
  return updateBoard(data, boardId, (b) => ({ ...b, archived: true }));
}

export function reorderBoards(data: KambanData, orderedIds: readonly string[]): KambanData {
  return { ...data, boards: applyOrder(data.boards, orderedIds) };
}

export function activeBoards(data: KambanData): Board[] {
  return data.boards.filter((b) => !b.archived).sort(byOrder);
}
