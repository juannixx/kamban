import { DomainError, requireText } from "./errors";
import type { ChecklistItem } from "./schema";

function indexOfItem(items: readonly ChecklistItem[], id: string): number {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) throw new DomainError(`Item do checklist não encontrado: ${id}`);
  return index;
}

export function addChecklistItem(items: readonly ChecklistItem[], id: string, text: string): ChecklistItem[] {
  return [...items, { id, text: requireText(text, "O item do checklist"), done: false }];
}

export function toggleChecklistItem(items: readonly ChecklistItem[], id: string): ChecklistItem[] {
  indexOfItem(items, id);
  return items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
}

export function renameChecklistItem(items: readonly ChecklistItem[], id: string, text: string): ChecklistItem[] {
  indexOfItem(items, id);
  const trimmed = requireText(text, "O item do checklist");
  return items.map((i) => (i.id === id ? { ...i, text: trimmed } : i));
}

export function removeChecklistItem(items: readonly ChecklistItem[], id: string): ChecklistItem[] {
  indexOfItem(items, id);
  return items.filter((i) => i.id !== id);
}

export function moveChecklistItem(items: readonly ChecklistItem[], id: string, delta: -1 | 1): ChecklistItem[] {
  const index = indexOfItem(items, id);
  const target = index + delta;
  const next = [...items];
  if (target < 0 || target >= items.length) return next;
  const [item] = next.splice(index, 1);
  if (item) next.splice(target, 0, item);
  return next;
}
