import { weekdayOf } from "./dates";
import { DomainError, requireText } from "./errors";
import { applyOrder, byOrder, nextOrder } from "./order";
import type { Habit, HabitSchedule, KambanData } from "./schema";

export function isHabitDueOn(habit: Habit, date: string): boolean {
  const day = weekdayOf(date);
  switch (habit.schedule.type) {
    case "daily":
      return true;
    case "weekdays":
      return day >= 1 && day <= 5;
    case "custom":
      return habit.schedule.days.includes(day);
  }
}

function normalizeSchedule(schedule: HabitSchedule): HabitSchedule {
  if (schedule.type !== "custom") return schedule;
  const days = [...new Set(schedule.days)].sort((a, b) => a - b);
  if (days.length === 0) throw new DomainError("Escolha ao menos um dia da semana para o hábito.");
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new DomainError("Dia da semana inválido.");
  }
  return { type: "custom", days };
}

export function getHabit(data: KambanData, habitId: string): Habit {
  const habit = data.habits.find((h) => h.id === habitId);
  if (!habit) throw new DomainError(`Hábito não encontrado: ${habitId}`);
  return habit;
}

function mapHabit(data: KambanData, habitId: string, fn: (habit: Habit) => Habit): KambanData {
  getHabit(data, habitId);
  return { ...data, habits: data.habits.map((h) => (h.id === habitId ? fn(h) : h)) };
}

export function addHabit(
  data: KambanData,
  input: { id: string; title: string; schedule: HabitSchedule; now: string },
): KambanData {
  const habit: Habit = {
    id: input.id,
    title: requireText(input.title, "Nome do hábito"),
    order: nextOrder(data.habits),
    archived: false,
    schedule: normalizeSchedule(input.schedule),
    createdAt: input.now,
  };
  return { ...data, habits: [...data.habits, habit] };
}

export function updateHabit(
  data: KambanData,
  habitId: string,
  patch: { title?: string; schedule?: HabitSchedule },
): KambanData {
  const title = patch.title !== undefined ? requireText(patch.title, "Nome do hábito") : undefined;
  const schedule = patch.schedule !== undefined ? normalizeSchedule(patch.schedule) : undefined;
  return mapHabit(data, habitId, (h) => ({
    ...h,
    ...(title !== undefined ? { title } : {}),
    ...(schedule !== undefined ? { schedule } : {}),
  }));
}

export function archiveHabit(data: KambanData, habitId: string): KambanData {
  return mapHabit(data, habitId, (h) => ({ ...h, archived: true }));
}

export function reorderHabits(data: KambanData, orderedIds: readonly string[]): KambanData {
  return { ...data, habits: applyOrder(data.habits, orderedIds) };
}

export function activeHabits(data: KambanData): Habit[] {
  return data.habits.filter((h) => !h.archived).sort(byOrder);
}

export function isHabitDone(data: KambanData, habitId: string, date: string): boolean {
  return data.habitLog.some((e) => e.habitId === habitId && e.date === date);
}

export function toggleHabit(data: KambanData, habitId: string, date: string): KambanData {
  getHabit(data, habitId);
  const habitLog = isHabitDone(data, habitId, date)
    ? data.habitLog.filter((e) => !(e.habitId === habitId && e.date === date))
    : [...data.habitLog, { habitId, date }];
  return { ...data, habitLog };
}
