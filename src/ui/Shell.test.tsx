// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addCard, getCard } from "../domain/cards";
import type { KambanData } from "../domain/schema";
import { NOW } from "../domain/testing";
import { App } from "./App";
import { setupApp } from "./testing";

afterEach(cleanup);

const nav = () => within(screen.getByRole("navigation", { name: "Navegação" }));
function seed(data: KambanData): KambanData {
  return addCard(data, { id: "k1", boardId: "id-1", columnId: "id-2", title: "Escrever relatório", now: NOW });
}
function seedTwo(data: KambanData): KambanData {
  const withK1 = addCard(data, { id: "k1", boardId: "id-1", columnId: "id-2", title: "Escrever relatório", now: NOW });
  return addCard(withK1, { id: "k2", boardId: "id-1", columnId: "id-2", title: "Pagar contas", now: NOW });
}

describe("Shell", () => {
  it("navega entre Hoje, quadro, Hábitos e Configurações", async () => {
    const { user } = await setupApp(<App />);
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeTruthy();
    await user.click(nav().getByRole("button", { name: "To-do" }));
    expect(screen.getByRole("region", { name: "Coluna A fazer" })).toBeTruthy();
    await user.click(nav().getByRole("button", { name: "Hábitos" }));
    expect(screen.getByRole("heading", { name: "Hábitos" })).toBeTruthy();
    await user.click(nav().getByRole("button", { name: "Configurações" }));
    expect(screen.getByRole("heading", { name: "Configurações" })).toBeTruthy();
    await user.click(nav().getByRole("button", { name: "Hoje" }));
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeTruthy();
  });

  it("cria um quadro pela barra lateral e abre", async () => {
    const { store, user } = await setupApp(<App />);
    await user.click(nav().getByRole("button", { name: "+ Novo quadro" }));
    await user.type(nav().getByRole("textbox", { name: "Nome do novo quadro" }), "Casa{Enter}");
    nav().getByRole("button", { name: "Casa" });
    const view = store.getState().view;
    expect(view.type === "board" && store.getState().data.boards.find((b) => b.id === view.boardId)?.name).toBe("Casa");
    expect(screen.getByRole("region", { name: "Coluna A fazer" })).toBeTruthy();
  });

  it("abre e fecha o detalhe do cartão a partir do quadro", async () => {
    const { user } = await setupApp(<App />, { seed });
    await user.click(nav().getByRole("button", { name: "To-do" }));
    await user.click(screen.getByRole("button", { name: "Escrever relatório" }));
    expect(screen.getByRole("complementary", { name: "Detalhe do cartão" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fechar detalhe" }));
    expect(screen.queryByRole("complementary", { name: "Detalhe do cartão" })).toBeNull();
  });

  it("mostra o status de gravação e 'Não salvo' quando a gravação falha", async () => {
    const { store, fs } = await setupApp(<App />);
    const status = () => nav().getByRole("status", { name: "Status de gravação" });
    expect(status().textContent).toBe("Salvo");
    act(() => {
      store.getState().renameBoard("id-1", "Tarefas");
    });
    expect(status().textContent).toBe("Alterações pendentes");
    fs.failWrites = true;
    await act(async () => {
      await store.getState().flush();
    });
    expect(status().textContent).toBe("Não salvo");
  });

  it("pergunta qual versão manter quando há conflito", async () => {
    const { store, user } = await setupApp(<App />);
    act(() => {
      store.setState({ conflict: true });
    });
    expect(screen.getByRole("dialog", { name: "O arquivo mudou fora do app" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Usar a versão do disco" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("texto digitado na descrição é salvo ao trocar de cartão", async () => {
    const { store, user } = await setupApp(<App />, { seed: seedTwo });
    await user.click(nav().getByRole("button", { name: "To-do" }));
    await user.click(screen.getByRole("button", { name: "Escrever relatório" }));
    await user.type(screen.getByRole("textbox", { name: "Descrição" }), "Rascunho");
    await user.click(screen.getByRole("button", { name: "Pagar contas" }));
    expect(getCard(store.getState().data, "k1").description).toBe("Rascunho");
    expect((screen.getByRole("textbox", { name: "Título" }) as HTMLInputElement).value).toBe("Pagar contas");
  });
});
