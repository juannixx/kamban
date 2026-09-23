import { describe, expect, it } from "vitest";
import { systemClock } from "./clock";

describe("systemClock", () => {
  it("today no formato YYYY-MM-DD e now em ISO 8601", () => {
    expect(systemClock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = systemClock.now();
    expect(new Date(now).toISOString()).toBe(now);
  });

  it("stamp não tem ':' nem '.' e ids são únicos", () => {
    expect(systemClock.stamp()).not.toMatch(/[:.]/);
    expect(systemClock.newId()).not.toBe(systemClock.newId());
  });
});
