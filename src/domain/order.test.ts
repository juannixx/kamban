import { describe, expect, it } from "vitest";
import { applyOrder, byOrder, nextOrder } from "./order";

describe("nextOrder", () => {
  it("retorna 0 para lista vazia e max + 1 caso contrário", () => {
    expect(nextOrder([])).toBe(0);
    expect(nextOrder([{ order: 3 }, { order: 1 }])).toBe(4);
  });
});

describe("byOrder", () => {
  it("ordena de forma crescente", () => {
    expect([{ order: 2 }, { order: 0 }].sort(byOrder)).toEqual([{ order: 0 }, { order: 2 }]);
  });
});

describe("applyOrder", () => {
  it("atribui order pela posição na lista de ids e mantém os demais", () => {
    const items = [
      { id: "a", order: 0 },
      { id: "b", order: 1 },
      { id: "c", order: 2 },
    ];
    expect(applyOrder(items, ["c", "a"])).toEqual([
      { id: "a", order: 1 },
      { id: "b", order: 1 },
      { id: "c", order: 0 },
    ]);
  });
});
