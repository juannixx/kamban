import { cardsInColumn } from "../../domain/cards";
import type { KambanData } from "../../domain/schema";

export const cardDndId = (id: string) => `card:${id}`;
export const columnDndId = (id: string) => `col:${id}`;

export function parseDndId(value: string | number): { type: "card" | "column"; id: string } | null {
  const text = String(value);
  if (text.startsWith("card:")) return { type: "card", id: text.slice("card:".length) };
  if (text.startsWith("col:")) return { type: "column", id: text.slice("col:".length) };
  return null;
}

/** Para onde vai um cartão solto sobre `overId`: antes do cartão alvo, ou no fim da coluna alvo. */
export function resolveCardDrop(
  data: KambanData,
  activeCardId: string,
  overId: string | number | null,
): { toColumnId: string; toIndex: number } | null {
  if (overId === null) return null;
  const over = parseDndId(overId);
  if (!over) return null;
  if (over.type === "column") return { toColumnId: over.id, toIndex: Number.MAX_SAFE_INTEGER };
  if (over.id === activeCardId) return null;
  const target = data.cards.find((c) => c.id === over.id);
  if (!target) return null;
  const index = cardsInColumn(data, target.columnId).findIndex((c) => c.id === target.id);
  return { toColumnId: target.columnId, toIndex: index };
}

/** Nova ordem das colunas quando a coluna ativa é solta sobre uma coluna ou um cartão dela. */
export function resolveColumnDrop(
  data: KambanData,
  orderedColumnIds: readonly string[],
  activeColumnId: string,
  overId: string | number | null,
): string[] | null {
  if (overId === null) return null;
  const over = parseDndId(overId);
  if (!over) return null;
  const targetId = over.type === "column" ? over.id : data.cards.find((c) => c.id === over.id)?.columnId;
  if (!targetId || targetId === activeColumnId) return null;
  const from = orderedColumnIds.indexOf(activeColumnId);
  const to = orderedColumnIds.indexOf(targetId);
  if (from === -1 || to === -1) return null;
  const next = [...orderedColumnIds];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}
