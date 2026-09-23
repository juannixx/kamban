import { describe, expect, it } from "vitest";
import { createEmptyData } from "./boards";
import { DomainError } from "./errors";
import {
  activeHabits,
  addHabit,
  archiveHabit,
  getHabit,
  isHabitDone,
  isHabitDueOn,
  reorderHabits,
  toggleHabit,
  updateHabit,
} from "./habits";
import type { HabitSchedule } from "./schema";
import { makeHabit, NOW } from "./testing";

// Semana de 20/09/2026 (domingo) a 26/09/2026 (sábado)
const WEEK = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];
const dueDays = (schedule: HabitSchedule) =>
  WEEK.map((d) => isHabitDueOn(makeHabit({ id: "h", schedule }), d));

describe("isHabitDueOn", () => {
  it("daily: todos os dias", () => {
    expect(dueDays({ type: "daily" })).toEqual([true, true, true, true, true, true, true]);
  });

  it("weekdays: segunda a sexta", () => {
    expect(dueDays({ type: "weekdays" })).toEqual([false, true, true, true, true, true, false]);
  });

  it("custom: só os dias escolhidos (seg, qua, sex)", () => {
    expect(dueDays({ type: "custom", days: [1, 3, 5] })).toEqual([false, true, false, true, false, true, false]);
  });
});

describe("addHabit / updateHabit / archiveHabit / reorderHabits", () => {
  it("cria, edita, reordena e arquiva", () => {
    let data = addHabit(createEmptyData(), { id: "h1", title: " Academia ", schedule: { type: "weekdays" }, now: NOW });
    data = addHabit(data, { id: "h2", title: "Ler", schedule: { type: "custom", days: [5, 1, 1] }, now: NOW });
    expect(getHabit(data, "h1")).toMatchObject({ title: "Academia", order: 0, archived: false, createdAt: NOW });
    expect(getHabit(data, "h2").schedule).toEqual({ type: "custom", days: [1, 5] });

    data = updateHabit(data, "h1", { title: "Treino", schedule: { type: "daily" } });
    data = reorderHabits(data, ["h2", "h1"]);
    expect(activeHabits(data).map((h) => h.title)).toEqual(["Ler", "Treino"]);

    data = archiveHabit(data, "h2");
    expect(activeHabits(data).map((h) => h.id)).toEqual(["h1"]);
  });

  it("rejeita título vazio, custom sem dias e hábito inexistente", () => {
    const data = createEmptyData();
    expect(() => addHabit(data, { id: "h1", title: "", schedule: { type: "daily" }, now: NOW })).toThrow(DomainError);
    expect(() => addHabit(data, { id: "h1", title: "X", schedule: { type: "custom", days: [] }, now: NOW })).toThrow(DomainError);
    expect(() => updateHabit(data, "nope", { title: "X" })).toThrow(DomainError);
  });
});

describe("toggleHabit / isHabitDone", () => {
  it("marca e desmarca por dia, sem duplicar registro", () => {
    let data = addHabit(createEmptyData(), { id: "h1", title: "Água", schedule: { type: "daily" }, now: NOW });
    data = toggleHabit(data, "h1", "2026-09-23");
    expect(isHabitDone(data, "h1", "2026-09-23")).toBe(true);
    expect(isHabitDone(data, "h1", "2026-09-24")).toBe(false);
    expect(data.habitLog).toEqual([{ habitId: "h1", date: "2026-09-23" }]);

    data = toggleHabit(data, "h1", "2026-09-23");
    expect(isHabitDone(data, "h1", "2026-09-23")).toBe(false);
    expect(data.habitLog).toEqual([]);
  });
});
