// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineEdit } from "./InlineEdit";

afterEach(cleanup);

describe("InlineEdit", () => {
  it("edita ao clicar, salva com Enter e cancela com Esc", async () => {
    const onSave = vi.fn(() => true);
    const user = userEvent.setup();
    render(<InlineEdit value="To-do" label="Nome do quadro" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "To-do" }));
    const field = screen.getByRole("textbox", { name: "Nome do quadro" });
    await user.clear(field);
    await user.type(field, "Tarefas{Enter}");
    expect(onSave).toHaveBeenCalledWith("Tarefas");
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "To-do" }));
    await user.type(screen.getByRole("textbox"), "xyz{Escape}");
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("continua editando se o salvamento for recusado", async () => {
    const user = userEvent.setup();
    render(<InlineEdit value="A" label="Nome" onSave={() => false} />);
    await user.click(screen.getByRole("button", { name: "A" }));
    await user.clear(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
