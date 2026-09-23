import { describe, expect, it } from "vitest";
import { toISODate, weekdayOf } from "./dates";

describe("toISODate", () => {
  it("formata a data local como YYYY-MM-DD com zeros à esquerda", () => {
    expect(toISODate(new Date(2026, 8, 3))).toBe("2026-09-03");
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("weekdayOf", () => {
  it("retorna 0 para domingo e 6 para sábado", () => {
    expect(weekdayOf("2026-09-27")).toBe(0);
    expect(weekdayOf("2026-09-21")).toBe(1);
    expect(weekdayOf("2026-09-23")).toBe(3);
    expect(weekdayOf("2026-09-26")).toBe(6);
  });
});
