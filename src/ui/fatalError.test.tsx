// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderFatalError } from "./fatalError";

afterEach(cleanup);

describe("renderFatalError", () => {
  it("mostra a mensagem e o erro como texto puro", () => {
    const container = document.createElement("div");
    renderFatalError(container, new Error("<b>x</b>"));

    expect(container.textContent).toContain("Não foi possível iniciar o Kamban");
    expect(container.textContent).toContain("<b>x</b>");
    expect(container.querySelector("b")).toBeNull();
  });

  it("substitui o conteúdo anterior do container", () => {
    const container = document.createElement("div");
    container.textContent = "conteúdo antigo";
    renderFatalError(container, "algo deu errado");

    expect(container.textContent).not.toContain("conteúdo antigo");
    expect(container.textContent).toContain("algo deu errado");
  });
});
