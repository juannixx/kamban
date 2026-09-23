// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addCard, getCard } from "../../domain/cards";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { setupApp } from "../testing";
import { CardPanel } from "./CardPanel";

afterEach(cleanup);

function seed(data: KambanData): KambanData {
  return addCard(data, { id: "k1", boardId: "id-1", columnId: "id-2", title: "Viagem", now: NOW });
}
const card = (store: Awaited<ReturnType<typeof setupApp>>["store"]) => getCard(store.getState().data, "k1");

describe("CardPanel", () => {
  it("edita o título ao sair do campo", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    const field = screen.getByRole("textbox", { name: "Título" });
    await user.clear(field);
    await user.type(field, "Viagem a SP");
    await user.tab();
    expect(card(store).title).toBe("Viagem a SP");
  });

  it("título vazio é recusado e volta ao anterior", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    const field = screen.getByRole("textbox", { name: "Título" });
    await user.clear(field);
    await user.tab();
    expect(card(store).title).toBe("Viagem");
    expect((field as HTMLInputElement).value).toBe("Viagem");
    expect(store.getState().notice).toBe("Título não pode ficar vazio.");
  });

  it("define e limpa prazo e prioridade", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    fireEvent.change(screen.getByLabelText("Prazo"), { target: { value: "2026-09-30" } });
    expect(card(store).dueDate).toBe("2026-09-30");
    fireEvent.change(screen.getByLabelText("Prazo"), { target: { value: "" } });
    expect(card(store).dueDate).toBeUndefined();
    await user.selectOptions(screen.getByLabelText("Prioridade"), "high");
    expect(card(store).priority).toBe("high");
    await user.selectOptions(screen.getByLabelText("Prioridade"), "");
    expect(card(store).priority).toBeUndefined();
  });

  it("descrição em Markdown com visualização", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    await user.type(screen.getByRole("textbox", { name: "Descrição" }), "Levar **documentos**");
    await user.click(screen.getByRole("button", { name: "Visualizar" }));
    expect(card(store).description).toBe("Levar **documentos**");
    expect(screen.getByText("documentos").tagName).toBe("STRONG");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("textbox", { name: "Descrição" })).toBeTruthy();
  });

  it("checklist: adiciona, marca, reordena e remove", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    const field = screen.getByRole("textbox", { name: "Novo item do checklist" });
    await user.type(field, "Passaporte{Enter}");
    await user.type(field, "Carregador{Enter}");
    expect(card(store).checklist.map((i) => i.text)).toEqual(["Passaporte", "Carregador"]);

    await user.click(screen.getByLabelText("Marcar Passaporte"));
    expect(card(store).checklist[0]!.done).toBe(true);
    expect(screen.getByText("Checklist (1/2)")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Descer Passaporte" }));
    expect(card(store).checklist.map((i) => i.text)).toEqual(["Carregador", "Passaporte"]);

    await user.click(screen.getByRole("button", { name: "Remover Carregador" }));
    expect(card(store).checklist.map((i) => i.text)).toEqual(["Passaporte"]);
  });

  it("arquiva o cartão", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    await user.click(screen.getByRole("button", { name: "Arquivar" }));
    expect(card(store).archived).toBe(true);
  });

  it("exclui o cartão depois de confirmar", async () => {
    const { store, user, platform } = await setupApp(<CardPanel cardId="k1" />, { seed });
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(store.getState().data.cards).toHaveLength(0));
    expect(platform.confirm).toHaveBeenCalledOnce();
  });

  it("fechar limpa a seleção", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    store.getState().openCard("k1");
    await user.click(screen.getByRole("button", { name: "Fechar detalhe" }));
    expect(store.getState().selectedCardId).toBeNull();
  });
});
