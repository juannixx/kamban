// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { commitFocusedDraft } from "./windowLifecycle";

afterEach(() => {
  document.body.innerHTML = "";
});

it("o padrão de commitDrafts tira o foco do campo em edição (dispara o onBlur)", () => {
  const field = document.createElement("input");
  document.body.append(field);
  let blurred = 0;
  field.addEventListener("blur", () => blurred++);
  field.focus();
  expect(document.activeElement).toBe(field);
  commitFocusedDraft();
  expect(blurred).toBe(1);
  expect(document.activeElement).not.toBe(field);
});
