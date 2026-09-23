import { describe, expect, it } from "vitest";
import { formatDayLabel, formatShortDate, toPriority } from "./format";

describe("format", () => {
  it("formata datas", () => {
    expect(formatShortDate("2026-09-03")).toBe("03/09");
    expect(formatDayLabel("2026-09-23")).toBe("qua, 23/09");
    expect(formatDayLabel("2026-09-27")).toBe("dom, 27/09");
  });

  it("converte texto em prioridade", () => {
    expect(toPriority("high")).toBe("high");
    expect(toPriority("")).toBeUndefined();
    expect(toPriority("urgente")).toBeUndefined();
  });
});
