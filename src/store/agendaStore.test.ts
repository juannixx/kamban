import { describe, expect, it, vi } from "vitest";
import { dayBounds, type AgendaCache, type CalendarAccount } from "../domain/agenda";
import { createAgendaStore, type CalendarService, type FetchRequest } from "./agendaStore";
import { fakeCalendarService, fakeClock, memoryAgendaCache, memorySettings } from "./testing";

const TODAY = "2026-09-24";
const pessoal: CalendarAccount = {
  id: "a1",
  email: "pessoal@gmail.com",
  mode: "details",
  color: "sky",
  calendars: [
    { id: "primary", name: "Pessoal", selected: true },
    { id: "feriados", name: "Feriados", selected: false },
  ],
};
const trabalho: CalendarAccount = { id: "a2", email: "voce@yousalaw.com", mode: "busy", color: "violet", calendars: [] };
const dentista = { kind: "event" as const, title: "Dentista", start: "2026-09-24T08:30:00-03:00", end: "2026-09-24T09:30:00-03:00", allDay: false };
const ocupado = { kind: "busy" as const, start: "2026-09-24T10:00:00-03:00", end: "2026-09-24T11:00:00-03:00", allDay: false };

function setup(options: { accounts?: CalendarAccount[]; cache?: AgendaCache | null; service?: Partial<CalendarService> } = {}) {
  const clock = fakeClock(TODAY);
  const settings = memorySettings(null, options.accounts ?? []);
  const cache = memoryAgendaCache(options.cache ?? null);
  const service = fakeCalendarService(options.service);
  const store = createAgendaStore({ service, settings, cache, clock });
  return { clock, settings, cache, service, store, state: () => store.getState() };
}

describe("init e refresh", () => {
  it("sem contas fica pronto e não chama o Google", async () => {
    const { service, state } = await setup();
    await state().init();
    expect(state()).toMatchObject({ ready: true, configured: true, accounts: [] });
    expect(service.fetchDay).not.toHaveBeenCalled();
  });

  it("busca o dia de todas as contas e grava o cache", async () => {
    const fetchDay = vi.fn(async (requests: FetchRequest[]) =>
      requests.map((r) => ({ email: r.email, items: r.mode === "busy" ? [ocupado] : [dentista] })),
    );
    const { cache, state } = setup({ accounts: [pessoal, trabalho], service: { fetchDay } });
    await state().init();
    const { start, end } = dayBounds(TODAY);
    expect(fetchDay).toHaveBeenCalledWith(
      [
        { email: "pessoal@gmail.com", mode: "details", calendarIds: ["primary"] },
        { email: "voce@yousalaw.com", mode: "busy", calendarIds: ["primary"] },
      ],
      start,
      end,
    );
    expect(cache.current?.date).toBe(TODAY);
    expect(cache.current?.accounts.a1?.items).toEqual([dentista]);
    expect(cache.current?.accounts.a2?.items).toEqual([ocupado]);
    expect(state().status).toEqual({ a1: "ok", a2: "ok" });
    expect(state().lastRefreshAt).toBe(`${TODAY}T12:00:00.000Z`);
  });

  it("erro de uma conta não afeta a outra e mantém o cache da que falhou", async () => {
    const previous: AgendaCache = { date: TODAY, accounts: { a2: { fetchedAt: "2026-09-24T08:00:00.000Z", items: [ocupado] } } };
    const fetchDay = vi.fn(async () => [
      { email: "pessoal@gmail.com", items: [dentista] },
      { email: "voce@yousalaw.com", error: { kind: "offline" as const, message: "sem rede" } },
    ]);
    const { cache, state } = setup({ accounts: [pessoal, trabalho], cache: previous, service: { fetchDay } });
    await state().init();
    expect(state().status).toEqual({ a1: "ok", a2: "offline" });
    expect(cache.current?.accounts.a2).toEqual(previous.accounts.a2);
    expect(cache.current?.accounts.a1?.items).toEqual([dentista]);
  });

  it("permissão revogada tira a conta do cache e marca 'revoked'", async () => {
    const previous: AgendaCache = { date: TODAY, accounts: { a1: { fetchedAt: "x", items: [dentista] } } };
    const fetchDay = vi.fn(async () => [{ email: "pessoal@gmail.com", error: { kind: "revoked" as const } }]);
    const { cache, state } = setup({ accounts: [pessoal], cache: previous, service: { fetchDay } });
    await state().init();
    expect(state().status).toEqual({ a1: "revoked" });
    expect(cache.current?.accounts.a1).toBeUndefined();
  });

  it("falha inesperada do serviço marca todas como sem conexão", async () => {
    const fetchDay = vi.fn(async () => {
      throw new Error("ipc caiu");
    });
    const { state } = setup({ accounts: [pessoal, trabalho], service: { fetchDay } });
    await state().init();
    expect(state().status).toEqual({ a1: "offline", a2: "offline" });
  });

  it("cache de outro dia é ignorado e a virada do dia busca o novo dia", async () => {
    const old: AgendaCache = { date: "2026-09-23", accounts: { a1: { fetchedAt: "x", items: [dentista] } } };
    const { clock, service, cache, state } = setup({ accounts: [pessoal], cache: old });
    await state().init();
    expect(cache.current?.date).toBe(TODAY);
    clock.setToday("2026-09-25");
    await state().tick();
    expect(service.fetchDay).toHaveBeenCalledTimes(2);
    expect(vi.mocked(service.fetchDay).mock.calls[1]?.[1]).toBe(dayBounds("2026-09-25").start);
    expect(cache.current?.date).toBe("2026-09-25");
  });

  it("refreshIfOlderThan respeita o intervalo", async () => {
    const { clock, service, state } = setup({ accounts: [pessoal] });
    await state().init();
    clock.setNow(`${TODAY}T12:00:30.000Z`);
    await state().refreshIfOlderThan(60_000);
    expect(service.fetchDay).toHaveBeenCalledTimes(1);
    clock.setNow(`${TODAY}T12:01:00.000Z`);
    await state().refreshIfOlderThan(60_000);
    expect(service.fetchDay).toHaveBeenCalledTimes(2);
  });

  it("não roda duas atualizações ao mesmo tempo, mas repete uma vez se pedirem durante", async () => {
    let release: () => void = () => {};
    // Precisa de uma conta já carregada em `accounts` para refresh() não sair cedo; init() usa o
    // fetchDay padrão (resolve na hora) e só depois trocamos a implementação para a pendente,
    // limpando a contagem de chamadas para medir só a rajada de refresh() abaixo.
    const { state, service } = setup({ accounts: [pessoal] });
    await state().init();
    const fetchDay = vi.mocked(service.fetchDay);
    fetchDay.mockClear();
    fetchDay.mockImplementation(
      (requests: FetchRequest[]) =>
        new Promise<{ email: string; items: never[] }[]>((resolve) => {
          release = () => resolve(requests.map((r) => ({ email: r.email, items: [] })));
        }),
    );
    const first = state().refresh();
    void state().refresh();
    void state().refresh();
    release();
    await vi.waitFor(() => expect(fetchDay).toHaveBeenCalledTimes(2));
    release();
    await first;
    await vi.waitFor(() => expect(state().refreshing).toBe(false));
    expect(fetchDay).toHaveBeenCalledTimes(2);
  });
});

describe("contas", () => {
  it("conectar com detalhes lista as agendas, marca a principal e atualiza", async () => {
    const listCalendars = vi.fn(async () => [
      { id: "primary", name: "Pessoal", primary: true },
      { id: "familia", name: "Família", primary: false },
    ]);
    const { settings, service, state } = setup({ service: { listCalendars } });
    await state().init();
    await state().connect("details");
    expect(service.connect).toHaveBeenCalledWith("details");
    expect(settings.accounts).toEqual([
      {
        id: "id-1",
        email: "pessoal@gmail.com",
        mode: "details",
        color: "sky",
        calendars: [
          { id: "primary", name: "Pessoal", selected: true },
          { id: "familia", name: "Família", selected: false },
        ],
      },
    ]);
    expect(service.fetchDay).toHaveBeenCalledOnce();
    expect(state().connecting).toBe(false);
  });

  it("conectar só horários não lista agendas", async () => {
    const connect = vi.fn(async () => "voce@yousalaw.com");
    const { settings, service, state } = setup({ service: { connect } });
    await state().init();
    await state().connect("busy");
    expect(service.listCalendars).not.toHaveBeenCalled();
    expect(settings.accounts[0]).toMatchObject({ email: "voce@yousalaw.com", mode: "busy", calendars: [] });
  });

  it("conectar de novo a mesma conta substitui, mantendo id e cor", async () => {
    const { settings, state } = setup({ accounts: [{ ...pessoal, color: "rose" }] });
    await state().init();
    await state().connect("busy");
    expect(settings.accounts).toHaveLength(1);
    expect(settings.accounts[0]).toMatchObject({ id: "a1", color: "rose", mode: "busy" });
  });

  it("erros ao conectar viram mensagem, e cancelar não mostra nada", async () => {
    const connect = vi.fn();
    const { state } = setup({ service: { connect } });
    await state().init();
    connect.mockRejectedValueOnce({ kind: "adminBlocked" });
    await state().connect("busy");
    expect(state().message).toBe("O administrador da conta bloqueou este app. Peça à TI para liberar o Kamban.");
    connect.mockRejectedValueOnce({ kind: "cancelled" });
    await state().connect("busy");
    expect(state().message).toBeNull();
    connect.mockRejectedValueOnce(new Error("estranho"));
    await state().connect("busy");
    expect(state().message).toBe("Não foi possível conectar: estranho");
  });

  it("desconectar apaga a permissão, a conta e o cache dela", async () => {
    const previous: AgendaCache = { date: TODAY, accounts: { a1: { fetchedAt: "x", items: [dentista] }, a2: { fetchedAt: "x", items: [ocupado] } } };
    const { settings, cache, service, state } = setup({ accounts: [pessoal, trabalho], cache: previous });
    await state().init();
    await state().disconnect("a1");
    expect(service.disconnect).toHaveBeenCalledWith("pessoal@gmail.com");
    expect(settings.accounts.map((a) => a.id)).toEqual(["a2"]);
    expect(cache.current?.accounts.a1).toBeUndefined();
    expect(state().status.a1).toBeUndefined();
  });

  it("marcar agenda grava e atualiza com as agendas escolhidas", async () => {
    const { settings, service, state } = setup({ accounts: [pessoal] });
    await state().init();
    await state().toggleCalendar("a1", "feriados");
    expect(settings.accounts[0]?.calendars.map((c) => c.selected)).toEqual([true, true]);
    expect(vi.mocked(service.fetchDay).mock.calls.at(-1)?.[0]).toEqual([
      { email: "pessoal@gmail.com", mode: "details", calendarIds: ["primary", "feriados"] },
    ]);
  });

  it("trocar a cor grava", async () => {
    const { settings, state } = setup({ accounts: [pessoal] });
    await state().init();
    await state().setColor("a1", "amber");
    expect(settings.accounts[0]?.color).toBe("amber");
  });
});
