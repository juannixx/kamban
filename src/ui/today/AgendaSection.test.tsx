// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgendaCache, CalendarAccount } from "../../domain/agenda";
import { setupApp } from "../testing";
import { AgendaSection } from "./AgendaSection";
import { TodayView } from "./TodayView";

const originalTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "America/Sao_Paulo";
});
afterEach(() => {
  cleanup();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

// setupApp usa fakeClock(): hoje = 2026-09-23, agora = 2026-09-23T12:00:00.000Z (09:00 em São Paulo)
const pessoal: CalendarAccount = {
  id: "a1",
  email: "pessoal@gmail.com",
  mode: "details",
  color: "sky",
  calendars: [{ id: "primary", name: "Pessoal", selected: true }],
};
const trabalho: CalendarAccount = { id: "a2", email: "voce@yousalaw.com", mode: "busy", color: "violet", calendars: [] };

const items = {
  a1: [
    { kind: "event" as const, title: "Café", start: "2026-09-23T07:00:00-03:00", end: "2026-09-23T07:30:00-03:00", allDay: false },
    { kind: "event" as const, title: "Dentista", start: "2026-09-23T08:30:00-03:00", end: "2026-09-23T09:30:00-03:00", allDay: false },
  ],
  a2: [{ kind: "busy" as const, start: "2026-09-23T10:00:00-03:00", end: "2026-09-23T11:00:00-03:00", allDay: false }],
};
const fetchAll = () =>
  vi.fn(async (requests: { email: string }[]) =>
    requests.map((r) => ({ email: r.email, items: r.email === "pessoal@gmail.com" ? items.a1 : items.a2 })),
  );

describe("AgendaSection", () => {
  it("sem contas convida a conectar", async () => {
    await setupApp(<AgendaSection />);
    expect(screen.getByText("Conecte sua agenda do Google em Configurações.")).toBeTruthy();
  });

  it("build sem credencial e sem contas não mostra a seção", async () => {
    await setupApp(<AgendaSection />, { agenda: { service: { isConfigured: vi.fn(async () => false) } } });
    expect(screen.queryByRole("region", { name: "Agenda" })).toBeNull();
  });

  it("mostra eventos e blocos das contas em ordem, com o status", async () => {
    await setupApp(<AgendaSection />, { agenda: { accounts: [pessoal, trabalho], service: { fetchDay: fetchAll() } } });
    const agenda = within(screen.getByRole("region", { name: "Agenda" }));
    const rows = agenda.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["07:00Café", "08:30Dentista", "10:00Ocupado (até 11:00)"]);
    expect(agenda.getByText("Café").closest("li")?.className).toContain("opacity-50");
    expect(agenda.getByText("Dentista").closest("li")?.className).not.toContain("opacity-50");
    expect(agenda.getAllByRole("img", { name: "Conta voce@yousalaw.com" })).toHaveLength(1);
    expect(agenda.getByRole("button", { name: "atualizada às 09:00" })).toBeTruthy();
  });

  it("sem conexão mostra o cache com o horário dos dados", async () => {
    const cache: AgendaCache = {
      date: "2026-09-23",
      accounts: { a2: { fetchedAt: "2026-09-23T11:12:00.000Z", items: items.a2 } },
    };
    const fetchDay = vi.fn(async () => [{ email: "voce@yousalaw.com", error: { kind: "offline" as const } }]);
    await setupApp(<AgendaSection />, { agenda: { accounts: [trabalho], cache, service: { fetchDay } } });
    expect(screen.getByRole("button", { name: "sem conexão · dados de 08:12" })).toBeTruthy();
    expect(screen.getByText("Ocupado (até 11:00)")).toBeTruthy();
  });

  it("permissão revogada pede para reconectar", async () => {
    const fetchDay = vi.fn(async () => [{ email: "pessoal@gmail.com", error: { kind: "revoked" as const } }]);
    await setupApp(<AgendaSection />, { agenda: { accounts: [pessoal], service: { fetchDay } } });
    expect(screen.getByRole("button", { name: "reconecte a conta pessoal@gmail.com" })).toBeTruthy();
    expect(screen.getByText("Nenhum evento hoje.")).toBeTruthy();
  });

  it("erro de leitura numa conta mostra qual conta, e clicar atualiza", async () => {
    const fetchDay = vi.fn(async () => [
      { email: "pessoal@gmail.com", items: items.a1 },
      { email: "voce@yousalaw.com", error: { kind: "other" as const, message: "Google respondeu 403" } },
    ]);
    const { user, agendaService } = await setupApp(<AgendaSection />, {
      agenda: { accounts: [pessoal, trabalho], service: { fetchDay } },
    });
    await user.click(screen.getByRole("button", { name: "erro na conta voce@yousalaw.com" }));
    await waitFor(() => expect(agendaService.fetchDay).toHaveBeenCalledTimes(2));
  });

  it("clicar no status atualiza de novo", async () => {
    const { user, agendaService } = await setupApp(<AgendaSection />, {
      agenda: { accounts: [pessoal], service: { fetchDay: fetchAll() } },
    });
    await user.click(screen.getByRole("button", { name: /atualizada às/ }));
    await waitFor(() => expect(agendaService.fetchDay).toHaveBeenCalledTimes(2));
  });

  it("na tela Hoje a Agenda vem antes da Rotina", async () => {
    await setupApp(<TodayView />, { agenda: { accounts: [pessoal], service: { fetchDay: fetchAll() } } });
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names.slice(0, 2)).toEqual(["Agenda", "Rotina"]);
  });
});
