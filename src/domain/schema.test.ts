import { describe, expect, it } from "vitest";
import { kambanDataSchema, type KambanData } from "./schema";
import { makeCard, makeHabit } from "./testing";

function validData(): KambanData {
  return {
    version: 1,
    boards: [
      {
        id: "b1",
        name: "To-do",
        order: 0,
        archived: false,
        columns: [
          { id: "c1", name: "A fazer", order: 0, isDone: false },
          { id: "c2", name: "Feito", order: 1, isDone: true },
        ],
      },
    ],
    cards: [makeCard({ id: "k1", boardId: "b1", columnId: "c1", dueDate: "2026-09-23", priority: "high" })],
    habits: [makeHabit({ id: "h1", schedule: { type: "custom", days: [1, 3, 5] } })],
    habitLog: [{ habitId: "h1", date: "2026-09-23" }],
  };
}

describe("kambanDataSchema", () => {
  it("aceita dados válidos", () => {
    expect(kambanDataSchema.safeParse(validData()).success).toBe(true);
  });

  it("rejeita quadro sem exatamente uma coluna isDone", () => {
    const data = validData();
    data.boards[0]!.columns[1]!.isDone = false;
    expect(kambanDataSchema.safeParse(data).success).toBe(false);

    const two = validData();
    two.boards[0]!.columns[0]!.isDone = true;
    expect(kambanDataSchema.safeParse(two).success).toBe(false);
  });

  it("rejeita dueDate fora do formato YYYY-MM-DD", () => {
    const data = validData();
    data.cards[0]!.dueDate = "23/09/2026";
    expect(kambanDataSchema.safeParse(data).success).toBe(false);
  });

  it("rejeita hábito custom sem dias ou com dia fora de 0..6", () => {
    const empty = validData();
    empty.habits[0]!.schedule = { type: "custom", days: [] };
    expect(kambanDataSchema.safeParse(empty).success).toBe(false);

    const outOfRange = validData();
    outOfRange.habits[0]!.schedule = { type: "custom", days: [7] };
    expect(kambanDataSchema.safeParse(outOfRange).success).toBe(false);
  });

  it("rejeita versão diferente da atual", () => {
    expect(kambanDataSchema.safeParse({ ...validData(), version: 2 }).success).toBe(false);
  });
});
