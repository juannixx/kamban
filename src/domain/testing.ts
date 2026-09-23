import type { Card, Habit } from "./schema";

export const NOW = "2026-09-23T12:00:00.000Z";
export const LATER = "2026-09-23T13:00:00.000Z";

export function makeCard(
  overrides: Partial<Card> & Pick<Card, "id" | "boardId" | "columnId">,
): Card {
  return {
    order: 0,
    title: `Cartão ${overrides.id}`,
    checklist: [],
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeHabit(overrides: Partial<Habit> & Pick<Habit, "id">): Habit {
  return {
    title: `Hábito ${overrides.id}`,
    order: 0,
    archived: false,
    schedule: { type: "daily" },
    createdAt: NOW,
    ...overrides,
  };
}
