// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addHabit, getHabit } from "../../domain/habits";
import type { HabitSchedule, KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { setupApp } from "../testing";
import { HabitsView } from "./HabitsView";

afterEach(cleanup);

const withHabit = (schedule: HabitSchedule) => (data: KambanData) =>
  addHabit(data, { id: "h1", title: "Água", schedule, now: NOW });
const newForm = () => within(screen.getByRole("form", { name: "Novo hábito" }));
const list = () => within(screen.getByRole("list", { name: "Hábitos" }));

describe("HabitsView", () => {
  it("cria um hábito diário", async () => {
    const { store, user } = await setupApp(<HabitsView />);
    expect(screen.getByText("Nenhum hábito ainda.")).toBeTruthy();
    await user.type(newForm().getByRole("textbox", { name: "Nome do novo hábito" }), "Ler");
    await user.click(newForm().getByRole("button", { name: "Adicionar" }));
    list().getByText("Ler");
    expect(store.getState().data.habits[0]).toMatchObject({ title: "Ler", schedule: { type: "daily" } });
    expect((newForm().getByRole("textbox") as HTMLInputElement).value).toBe("");
  });

  it("cria um hábito em dias específicos", async () => {
    const { store, user } = await setupApp(<HabitsView />);
    await user.type(newForm().getByRole("textbox", { name: "Nome do novo hábito" }), "Academia");
    await user.selectOptions(newForm().getByRole("combobox", { name: "Programação" }), "custom");
    await user.click(newForm().getByRole("button", { name: "quarta" }));
    await user.click(newForm().getByRole("button", { name: "sexta" }));
    await user.click(newForm().getByRole("button", { name: "segunda" }));
    await user.click(newForm().getByRole("button", { name: "Adicionar" }));
    expect(store.getState().data.habits[0]!.schedule).toEqual({ type: "custom", days: [3, 5] });
  });

  it("renomeia, muda a programação e arquiva um hábito", async () => {
    const { store, user } = await setupApp(<HabitsView />, { seed: withHabit({ type: "daily" }) });
    await user.click(list().getByRole("button", { name: "Água" }));
    const field = list().getByRole("textbox", { name: "Nome do hábito" });
    await user.clear(field);
    await user.type(field, "Beber água{Enter}");
    await user.selectOptions(list().getByRole("combobox", { name: "Programação" }), "weekdays");
    expect(getHabit(store.getState().data, "h1")).toMatchObject({ title: "Beber água", schedule: { type: "weekdays" } });

    await user.click(list().getByRole("button", { name: "Arquivar" }));
    expect(getHabit(store.getState().data, "h1").archived).toBe(true);
    expect(screen.getByText("Nenhum hábito ainda.")).toBeTruthy();
  });

  it("desmarcar o último dia é recusado com aviso", async () => {
    const { store, user } = await setupApp(<HabitsView />, { seed: withHabit({ type: "custom", days: [3] }) });
    await user.click(list().getByRole("button", { name: "quarta" }));
    expect(getHabit(store.getState().data, "h1").schedule).toEqual({ type: "custom", days: [3] });
    expect(store.getState().notice).toBe("Escolha ao menos um dia da semana para o hábito.");
  });
});
