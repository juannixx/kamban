// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addCard, getCard, updateCard } from "../../domain/cards";
import { addHabit, isHabitDone } from "../../domain/habits";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { setupApp } from "../testing";
import { TodayView } from "./TodayView";

afterEach(cleanup);

const TODAY = "2026-09-23"; // quarta

function seed(data: KambanData): KambanData {
  let d = addHabit(data, { id: "h1", title: "Água", schedule: { type: "daily" }, now: NOW });
  d = addHabit(d, { id: "h2", title: "Faxina", schedule: { type: "custom", days: [6] }, now: NOW });
  d = addCard(d, { id: "k1", boardId: "id-1", columnId: "id-2", title: "Pagar IPVA", now: NOW });
  d = updateCard(d, "k1", { dueDate: "2026-09-20" }, NOW);
  d = addCard(d, { id: "k2", boardId: "id-1", columnId: "id-3", title: "Revisar proposta", now: NOW });
  d = updateCard(d, "k2", { dueDate: TODAY, priority: "high" }, NOW);
  return d;
}

describe("TodayView", () => {
  it("mostra a data, a rotina do dia, os atrasados e os de hoje", async () => {
    await setupApp(<TodayView />, { seed });
    expect(screen.getByText("qua, 23/09")).toBeTruthy();
    expect(screen.getByLabelText("Água")).toBeTruthy();
    expect(screen.queryByText("Faxina")).toBeNull();
    expect(screen.getByText("0/1 feitos")).toBeTruthy();
    within(screen.getByRole("region", { name: "Atrasados" })).getByText("Pagar IPVA");
    const dueToday = within(screen.getByRole("region", { name: "Para hoje" }));
    dueToday.getByText("Revisar proposta");
    dueToday.getByText("Alta");
    dueToday.getByText("To-do");
  });

  it("marca o hábito do dia", async () => {
    const { store, user } = await setupApp(<TodayView />, { seed });
    await user.click(screen.getByLabelText("Água"));
    expect(isHabitDone(store.getState().data, "h1", TODAY)).toBe(true);
    expect(screen.getByText("1/1 feitos")).toBeTruthy();
  });

  it("concluir move o cartão para a coluna Feito e tira da lista", async () => {
    const { store, user } = await setupApp(<TodayView />, { seed });
    await user.click(screen.getByLabelText("Concluir Pagar IPVA"));
    expect(getCard(store.getState().data, "k1").columnId).toBe("id-4");
    expect(screen.queryByText("Pagar IPVA")).toBeNull();
  });

  it("clicar no título abre o detalhe do cartão", async () => {
    const { store, user } = await setupApp(<TodayView />, { seed });
    await user.click(screen.getByRole("button", { name: "Revisar proposta" }));
    expect(store.getState().selectedCardId).toBe("k2");
  });

  it("sem hábitos nem prazos mostra mensagens vazias", async () => {
    await setupApp(<TodayView />);
    expect(screen.getByText("Nenhum hábito para hoje.")).toBeTruthy();
    expect(screen.getByText("Nada com prazo para hoje.")).toBeTruthy();
  });
});
