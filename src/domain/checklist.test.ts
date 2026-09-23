import { describe, expect, it } from "vitest";
import {
  addChecklistItem,
  moveChecklistItem,
  removeChecklistItem,
  renameChecklistItem,
  toggleChecklistItem,
} from "./checklist";
import { DomainError } from "./errors";
import type { ChecklistItem } from "./schema";

const items: ChecklistItem[] = [
  { id: "a", text: "Um", done: false },
  { id: "b", text: "Dois", done: true },
  { id: "c", text: "Três", done: false },
];
const ids = (list: ChecklistItem[]) => list.map((i) => i.id);

describe("addChecklistItem", () => {
  it("adiciona no fim, não feito, com texto sem espaços nas pontas", () => {
    expect(addChecklistItem(items, "d", "  Quatro ").at(-1)).toEqual({ id: "d", text: "Quatro", done: false });
  });

  it("rejeita texto vazio", () => {
    expect(() => addChecklistItem(items, "d", "  ")).toThrow(DomainError);
  });
});

describe("toggleChecklistItem / renameChecklistItem / removeChecklistItem", () => {
  it("alterna, renomeia e remove sem alterar a lista original", () => {
    expect(toggleChecklistItem(items, "a")[0]!.done).toBe(true);
    expect(renameChecklistItem(items, "b", " Dois! ")[1]!.text).toBe("Dois!");
    expect(ids(removeChecklistItem(items, "b"))).toEqual(["a", "c"]);
    expect(ids(items)).toEqual(["a", "b", "c"]);
  });

  it("rejeita item inexistente e texto vazio", () => {
    expect(() => toggleChecklistItem(items, "x")).toThrow(DomainError);
    expect(() => removeChecklistItem(items, "x")).toThrow(DomainError);
    expect(() => renameChecklistItem(items, "a", "")).toThrow(DomainError);
  });
});

describe("moveChecklistItem", () => {
  it("sobe e desce uma posição", () => {
    expect(ids(moveChecklistItem(items, "c", -1))).toEqual(["a", "c", "b"]);
    expect(ids(moveChecklistItem(items, "a", 1))).toEqual(["b", "a", "c"]);
  });

  it("não sai dos limites", () => {
    expect(ids(moveChecklistItem(items, "a", -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveChecklistItem(items, "c", 1))).toEqual(["a", "b", "c"]);
  });

  it("rejeita item inexistente", () => {
    expect(() => moveChecklistItem(items, "x", 1)).toThrow(DomainError);
  });
});
