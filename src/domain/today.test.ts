import { describe, expect, it } from "vitest";
import { addBoard, archiveBoard, createInitialData } from "./boards";
import { addCard, archiveCard, completeCard, updateCard, type CardPatch } from "./cards";
import { addHabit, toggleHabit } from "./habits";
import type { KambanData } from "./schema";
import { NOW } from "./testing";
import { buildToday } from "./today";

const TODAY = "2026-09-23"; // quarta-feira

function card(data: KambanData, id: string, boardId: string, columnId: string, patch: CardPatch): KambanData {
  return updateCard(addCard(data, { id, boardId, columnId, title: id, now: NOW }), id, patch, NOW);
}

function fixture(): KambanData {
  let data = createInitialData({ id: "b1", columnIds: ["c-todo", "c-doing", "c-done"] });
  data = addBoard(data, { id: "b2", name: "Casa", columnIds: ["d-todo", "d-doing", "d-done"] });
  data = addBoard(data, { id: "b3", name: "Antigo", columnIds: ["e-todo", "e-doing", "e-done"] });

  data = card(data, "late-2", "b1", "c-todo", { dueDate: "2026-09-22" });
  data = card(data, "late-1", "b2", "d-doing", { dueDate: "2026-09-20" });
  data = card(data, "today-low", "b1", "c-todo", { dueDate: TODAY, priority: "low" });
  data = card(data, "today-none", "b1", "c-todo", { dueDate: TODAY });
  data = card(data, "today-high", "b2", "d-todo", { dueDate: TODAY, priority: "high" });
  data = card(data, "future", "b1", "c-todo", { dueDate: "2026-09-24" });
  data = card(data, "no-date", "b1", "c-todo", {});
  data = card(data, "done", "b1", "c-todo", { dueDate: "2026-09-21" });
  data = completeCard(data, "done", NOW);
  data = card(data, "archived", "b1", "c-todo", { dueDate: TODAY });
  data = archiveCard(data, "archived", NOW);
  data = card(data, "archived-board", "b3", "e-todo", { dueDate: TODAY });
  data = archiveBoard(data, "b3");

  data = addHabit(data, { id: "h-daily", title: "Água", schedule: { type: "daily" }, now: NOW });
  data = addHabit(data, { id: "h-wed", title: "Ler", schedule: { type: "custom", days: [3] }, now: NOW });
  data = addHabit(data, { id: "h-sat", title: "Faxina", schedule: { type: "custom", days: [6] }, now: NOW });
  data = toggleHabit(data, "h-wed", TODAY);
  return data;
}

describe("buildToday", () => {
  const view = buildToday(fixture(), TODAY);

  it("lista atrasados do mais antigo para o mais recente, com nome do quadro", () => {
    expect(view.overdue.map((x) => [x.card.id, x.boardName])).toEqual([
      ["late-1", "Casa"],
      ["late-2", "To-do"],
    ]);
  });

  it("lista os de hoje por prioridade: alta, média, baixa, sem prioridade", () => {
    expect(view.dueToday.map((x) => x.card.id)).toEqual(["today-high", "today-low", "today-none"]);
  });

  it("ignora concluídos, arquivados, sem data, futuros e cartões de quadro arquivado", () => {
    const all = [...view.overdue, ...view.dueToday].map((x) => x.card.id);
    for (const id of ["done", "archived", "no-date", "future", "archived-board"]) {
      expect(all).not.toContain(id);
    }
  });

  it("lista só os hábitos devidos hoje, com status e contador", () => {
    expect(view.habits.map((h) => [h.habit.id, h.done])).toEqual([
      ["h-daily", false],
      ["h-wed", true],
    ]);
    expect(view.habitsDone).toBe(1);
  });
});
