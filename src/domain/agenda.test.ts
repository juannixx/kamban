import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAgenda,
  dayBounds,
  mergeBusy,
  nextColor,
  parseAgendaCache,
  parseCalendarAccounts,
  type AgendaCache,
  type AgendaItem,
  type CalendarAccount,
} from "./agenda";

const originalTz = process.env.TZ;
function useTimezone(tz: string) {
  beforeEach(() => {
    process.env.TZ = tz;
  });
  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });
}

const pessoal: CalendarAccount = {
  id: "a1",
  email: "pessoal@gmail.com",
  mode: "details",
  color: "sky",
  calendars: [{ id: "primary", name: "Pessoal", selected: true }],
};
const trabalho: CalendarAccount = { id: "a2", email: "voce@yousalaw.com", mode: "busy", color: "violet", calendars: [] };

const event = (title: string, start: string, end: string): AgendaItem => ({ kind: "event", title, start, end, allDay: false });
const busy = (start: string, end: string): AgendaItem => ({ kind: "busy", start, end, allDay: false });

describe("dayBounds", () => {
  describe("em São Paulo", () => {
    useTimezone("America/Sao_Paulo");
    it("vai da meia-noite local até a meia-noite seguinte", () => {
      expect(dayBounds("2026-09-24")).toEqual({ start: "2026-09-24T00:00:00-03:00", end: "2026-09-25T00:00:00-03:00" });
    });
  });

  describe("com horário de verão (Nova York)", () => {
    useTimezone("America/New_York");
    it("dia de 23 horas muda o deslocamento no fim", () => {
      expect(dayBounds("2026-03-08")).toEqual({ start: "2026-03-08T00:00:00-05:00", end: "2026-03-09T00:00:00-04:00" });
    });
  });
});

describe("depois de useTimezone", () => {
  it("restaura o TZ original, sem deixar a string 'undefined'", () => {
    if (originalTz === undefined) {
      expect("TZ" in process.env).toBe(false);
    } else {
      expect(process.env.TZ).toBe(originalTz);
    }
  });
});

describe("mergeBusy", () => {
  it("une blocos que se tocam ou se sobrepõem e ignora eventos", () => {
    const merged = mergeBusy([
      busy("2026-09-24T14:00:00-03:00", "2026-09-24T15:00:00-03:00"),
      busy("2026-09-24T10:00:00-03:00", "2026-09-24T11:00:00-03:00"),
      busy("2026-09-24T11:00:00-03:00", "2026-09-24T11:30:00-03:00"),
      busy("2026-09-24T10:30:00-03:00", "2026-09-24T10:45:00-03:00"),
      event("Não entra", "2026-09-24T12:00:00-03:00", "2026-09-24T13:00:00-03:00"),
    ]);
    expect(merged.map((b) => [b.start, b.end])).toEqual([
      ["2026-09-24T10:00:00-03:00", "2026-09-24T11:30:00-03:00"],
      ["2026-09-24T14:00:00-03:00", "2026-09-24T15:00:00-03:00"],
    ]);
  });
});

describe("buildAgenda", () => {
  useTimezone("America/Sao_Paulo");

  const cache: AgendaCache = {
    date: "2026-09-24",
    accounts: {
      a1: {
        fetchedAt: "2026-09-24T09:12:00.000Z",
        items: [
          event("Jantar", "2026-09-24T19:00:00-03:00", "2026-09-24T21:00:00-03:00"),
          { kind: "event", title: "Aniversário", start: "2026-09-24", end: "2026-09-25", allDay: true },
          event("Dentista", "2026-09-24T08:30:00-03:00", "2026-09-24T09:30:00-03:00"),
          event("Plantão", "2026-09-23T22:00:00-03:00", "2026-09-24T01:00:00-03:00"),
          { kind: "event", start: "2026-09-24T16:00:00-03:00", end: "2026-09-24T16:30:00-03:00", allDay: false },
        ],
      },
      a2: {
        fetchedAt: "2026-09-24T09:12:00.000Z",
        items: [
          busy("2026-09-24T10:00:00-03:00", "2026-09-24T11:00:00-03:00"),
          busy("2026-09-24T11:00:00-03:00", "2026-09-24T11:30:00-03:00"),
          busy("2026-09-24T14:00:00-03:00", "2026-09-24T15:00:00-03:00"),
          busy("2026-09-24T22:00:00-03:00", "2026-09-25T00:00:00-03:00"),
        ],
      },
    },
  };
  const now = new Date("2026-09-24T12:00:00-03:00");

  it("ordena dia inteiro primeiro e depois por horário, com rótulos e passado", () => {
    const rows = buildAgenda(cache, [pessoal, trabalho], "2026-09-24", now);
    expect(rows.map((r) => [r.timeLabel, r.title, r.color, r.past])).toEqual([
      ["Dia todo", "Aniversário", "sky", false],
      ["23/09 22:00", "Plantão", "sky", true],
      ["08:30", "Dentista", "sky", true],
      ["10:00", "Ocupado (até 11:30)", "violet", true],
      ["14:00", "Ocupado (até 15:00)", "violet", false],
      ["16:00", "(sem título)", "sky", false],
      ["19:00", "Jantar", "sky", false],
      ["22:00", "Ocupado (até o fim do dia)", "violet", false],
    ]);
    expect(rows[3]).toMatchObject({ kind: "busy", accountId: "a2", accountEmail: "voce@yousalaw.com", allDay: false });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("cache de outro dia, sem cache ou conta sem dados não mostram nada", () => {
    expect(buildAgenda({ ...cache, date: "2026-09-23" }, [pessoal], "2026-09-24", now)).toEqual([]);
    expect(buildAgenda(null, [pessoal], "2026-09-24", now)).toEqual([]);
    const outra: CalendarAccount = { ...pessoal, id: "a9" };
    expect(buildAgenda(cache, [outra], "2026-09-24", now)).toEqual([]);
  });

  it("só mostra contas que ainda estão conectadas", () => {
    const rows = buildAgenda(cache, [trabalho], "2026-09-24", now);
    expect(rows.every((r) => r.accountId === "a2")).toBe(true);
  });
});

describe("parsers e cores", () => {
  it("parseAgendaCache aceita cache válido e recusa o resto", () => {
    const valid: AgendaCache = { date: "2026-09-24", accounts: {} };
    expect(parseAgendaCache(JSON.stringify(valid))).toEqual(valid);
    expect(parseAgendaCache("{")).toBeNull();
    expect(parseAgendaCache(JSON.stringify({ date: "24/09" }))).toBeNull();
  });

  it("parseCalendarAccounts devolve lista vazia para dado inválido", () => {
    expect(parseCalendarAccounts([pessoal])).toEqual([pessoal]);
    expect(parseCalendarAccounts(undefined)).toEqual([]);
    expect(parseCalendarAccounts([{ email: "x" }])).toEqual([]);
  });

  it("nextColor usa a primeira cor livre", () => {
    expect(nextColor([])).toBe("sky");
    expect(nextColor([pessoal])).toBe("violet");
    expect(nextColor([pessoal, trabalho])).toBe("emerald");
  });
});
