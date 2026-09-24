import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

import { tauriCalendarService } from "./googleCalendar";

beforeEach(() => {
  core.invoke.mockReset();
});

describe("tauriCalendarService", () => {
  it("connect chama o comando com o modo e devolve o e-mail", async () => {
    core.invoke.mockResolvedValueOnce({ email: "pessoal@gmail.com" });
    expect(await tauriCalendarService.connect("busy")).toBe("pessoal@gmail.com");
    expect(core.invoke).toHaveBeenCalledWith("google_connect", { mode: "busy" });
  });

  it("erros do Rust viram AgendaError", async () => {
    core.invoke.mockRejectedValueOnce({ kind: "adminBlocked" });
    await expect(tauriCalendarService.connect("details")).rejects.toEqual({ kind: "adminBlocked" });
    core.invoke.mockRejectedValueOnce("texto solto");
    await expect(tauriCalendarService.listCalendars("x")).rejects.toEqual({ kind: "other", message: "texto solto" });
  });

  it("fetchDay repassa pedidos e converte os resultados por conta", async () => {
    core.invoke.mockResolvedValueOnce([
      { email: "a@gmail.com", items: [{ kind: "event", title: "X", start: "s", end: "e", allDay: false }] },
      { email: "b@yousalaw.com", error: { kind: "offline", message: "sem rede" } },
      { email: "c@gmail.com", items: [{ kind: "estranho" }] },
    ]);
    const requests = [{ email: "a@gmail.com", mode: "details" as const, calendarIds: ["primary"] }];
    const results = await tauriCalendarService.fetchDay(requests, "ini", "fim");
    expect(core.invoke).toHaveBeenCalledWith("google_fetch_day", { accounts: requests, dayStart: "ini", dayEnd: "fim" });
    expect(results).toEqual([
      { email: "a@gmail.com", items: [{ kind: "event", title: "X", start: "s", end: "e", allDay: false }] },
      { email: "b@yousalaw.com", error: { kind: "offline", message: "sem rede" } },
      { email: "c@gmail.com", error: { kind: "other", message: "Resposta inesperada da agenda." } },
    ]);
  });

  it("isConfigured devolve false se o comando falhar", async () => {
    core.invoke.mockRejectedValueOnce(new Error("sem comando"));
    expect(await tauriCalendarService.isConfigured()).toBe(false);
  });
});
