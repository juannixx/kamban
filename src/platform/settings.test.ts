import { describe, expect, it, vi } from "vitest";

const values = vi.hoisted(() => new Map<string, unknown>());
const storeMock = vi.hoisted(() => ({
  load: vi.fn(async () => ({
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    save: vi.fn(async () => {}),
  })),
}));
vi.mock("@tauri-apps/plugin-store", () => storeMock);

import { createTauriSettings } from "./settings";

describe("createTauriSettings", () => {
  it("guarda pasta e contas da agenda no mesmo settings.json", async () => {
    const settings = await createTauriSettings();
    expect(await settings.getCalendarAccounts()).toEqual([]);
    const account = { id: "a1", email: "p@gmail.com", mode: "busy" as const, color: "sky" as const, calendars: [] };
    await settings.setCalendarAccounts([account]);
    expect(await settings.getCalendarAccounts()).toEqual([account]);
    await settings.setDataDir("/data");
    expect(await settings.getDataDir()).toBe("/data");
    expect(storeMock.load).toHaveBeenCalledOnce();
  });

  it("contas inválidas no arquivo viram lista vazia", async () => {
    values.set("calendarAccounts", [{ email: "sem id" }]);
    const settings = await createTauriSettings();
    expect(await settings.getCalendarAccounts()).toEqual([]);
  });
});
