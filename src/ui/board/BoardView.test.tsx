// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getBoard, getColumn } from "../../domain/boards";
import { addCard, cardsInColumn, getCard } from "../../domain/cards";
import { boardColumns } from "../../domain/columns";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { setupApp } from "../testing";
import { BoardView } from "./BoardView";

afterEach(cleanup);

function seed(data: KambanData): KambanData {
  return addCard(data, { id: "k1", boardId: "id-1", columnId: "id-3", title: "Escrever relatório", now: NOW });
}
const column = (name: string) => within(screen.getByRole("region", { name: `Coluna ${name}` }));
const columnNames = (data: KambanData) => boardColumns(getBoard(data, "id-1")).map((c) => c.name);

describe("BoardView", () => {
  it("mostra as colunas e marca a de concluídos", async () => {
    await setupApp(<BoardView boardId="id-1" />, { seed });
    column("A fazer");
    column("Fazendo").getByText("Escrever relatório");
    column("Feito").getByText("Concluídos");
  });

  it("adiciona cartões pelo formulário da coluna e mantém o campo aberto", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(column("A fazer").getByRole("button", { name: "+ Adicionar cartão" }));
    const field = column("A fazer").getByRole("textbox", { name: "Título do novo cartão" });
    await user.type(field, "Comprar pão{Enter}");
    await user.type(field, "Ligar para o banco{Enter}");
    expect(cardsInColumn(store.getState().data, "id-2").map((c) => c.title)).toEqual(["Comprar pão", "Ligar para o banco"]);
    expect((field as HTMLInputElement).value).toBe("");
    column("A fazer").getByText("Comprar pão");
  });

  it("renomeia o quadro", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByRole("button", { name: "To-do" }));
    const field = screen.getByRole("textbox", { name: "Nome do quadro" });
    await user.clear(field);
    await user.type(field, "Tarefas{Enter}");
    expect(getBoard(store.getState().data, "id-1").name).toBe("Tarefas");
  });

  it("remove coluna com cartões escolhendo o destino", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />, { seed });
    await user.click(screen.getByLabelText("Opções da coluna Fazendo"));
    await user.click(column("Fazendo").getByRole("button", { name: "Remover coluna" }));
    await user.selectOptions(column("Fazendo").getByRole("combobox", { name: "Coluna de destino" }), "id-4");
    await user.click(column("Fazendo").getByRole("button", { name: "Remover e mover" }));
    expect(columnNames(store.getState().data)).toEqual(["A fazer", "Feito"]);
    expect(getCard(store.getState().data, "k1").columnId).toBe("id-4");
  });

  it("remove coluna vazia depois de confirmar", async () => {
    const { store, user, platform } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByLabelText("Opções da coluna A fazer"));
    await user.click(column("A fazer").getByRole("button", { name: "Remover coluna" }));
    await waitFor(() => expect(columnNames(store.getState().data)).toEqual(["Fazendo", "Feito"]));
    expect(platform.confirm).toHaveBeenCalledOnce();
  });

  it("usa outra coluna como concluídos", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByLabelText("Opções da coluna Fazendo"));
    await user.click(column("Fazendo").getByRole("button", { name: "Usar como coluna de concluídos" }));
    expect(getColumn(getBoard(store.getState().data, "id-1"), "id-3").isDone).toBe(true);
    column("Fazendo").getByText("Concluídos");
  });

  it("adiciona coluna", async () => {
    const { user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByRole("button", { name: "+ Nova coluna" }));
    await user.type(screen.getByRole("textbox", { name: "Nome da nova coluna" }), "Aguardando{Enter}");
    column("Aguardando");
  });

  it("arquiva o quadro depois de confirmar", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByRole("button", { name: "Arquivar quadro" }));
    await waitFor(() => expect(getBoard(store.getState().data, "id-1").archived).toBe(true));
  });

  it("clicar no cartão abre o detalhe", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />, { seed });
    await user.click(screen.getByRole("button", { name: "Escrever relatório" }));
    expect(store.getState().selectedCardId).toBe("k1");
  });

  it("quadro inexistente mostra aviso", async () => {
    await setupApp(<BoardView boardId="nope" />);
    expect(screen.getByText("Quadro não encontrado.")).toBeTruthy();
  });
});
