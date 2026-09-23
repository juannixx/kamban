import { activeBoards } from "./boards";
import { activeHabits, isHabitDone, isHabitDueOn } from "./habits";
import type { Card, Habit, KambanData, Priority } from "./schema";

export interface TodayCard {
  card: Card;
  boardName: string;
}

export interface TodayHabit {
  habit: Habit;
  done: boolean;
}

export interface TodayView {
  habits: TodayHabit[];
  habitsDone: number;
  overdue: TodayCard[];
  dueToday: TodayCard[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const NO_PRIORITY_RANK = 3;

function priorityRank(card: Card): number {
  return card.priority ? PRIORITY_RANK[card.priority] : NO_PRIORITY_RANK;
}

/** Cartões abertos (fora da coluna de concluídos, não arquivados, de quadros ativos) com prazo. */
function openCardsWithDueDate(data: KambanData): TodayCard[] {
  const result: TodayCard[] = [];
  for (const board of activeBoards(data)) {
    const doneColumnId = board.columns.find((c) => c.isDone)?.id;
    for (const card of data.cards) {
      if (card.boardId === board.id && !card.archived && card.columnId !== doneColumnId && card.dueDate) {
        result.push({ card, boardName: board.name });
      }
    }
  }
  return result;
}

export function buildToday(data: KambanData, today: string): TodayView {
  const habits = activeHabits(data)
    .filter((habit) => isHabitDueOn(habit, today))
    .map((habit) => ({ habit, done: isHabitDone(data, habit.id, today) }));

  const open = openCardsWithDueDate(data);
  const dueDate = (x: TodayCard) => x.card.dueDate ?? "";

  const overdue = open.filter((x) => dueDate(x) < today).sort((a, b) => dueDate(a).localeCompare(dueDate(b)));
  const dueToday = open.filter((x) => dueDate(x) === today).sort((a, b) => priorityRank(a.card) - priorityRank(b.card));

  return { habits, habitsDone: habits.filter((h) => h.done).length, overdue, dueToday };
}
