import { createStore, type StoreApi } from "zustand/vanilla";
import {
  dayBounds,
  nextColor,
  type AccountMode,
  type AgendaCache,
  type AgendaColor,
  type AgendaItem,
  type CalendarAccount,
} from "../domain/agenda";
import type { Clock } from "./appStore";

export type AgendaErrorKind = "notConfigured" | "offline" | "revoked" | "adminBlocked" | "cancelled" | "timeout" | "other";

export interface AgendaError {
  kind: AgendaErrorKind;
  message?: string;
}

const ERROR_KINDS: readonly string[] = ["notConfigured", "offline", "revoked", "adminBlocked", "cancelled", "timeout", "other"];

/** Converte o erro que chega do Rust ({ kind, message? }) ou qualquer outra falha. */
export function toAgendaError(error: unknown): AgendaError {
  if (typeof error === "object" && error !== null && "kind" in error && typeof error.kind === "string" && ERROR_KINDS.includes(error.kind)) {
    const message = "message" in error && typeof error.message === "string" ? error.message : undefined;
    return { kind: error.kind as AgendaErrorKind, ...(message !== undefined ? { message } : {}) };
  }
  return { kind: "other", message: error instanceof Error ? error.message : String(error) };
}

export function connectErrorMessage(error: AgendaError): string | null {
  switch (error.kind) {
    case "cancelled":
      return null;
    case "timeout":
      return "O login não foi concluído em 5 minutos. Se o Google disse que o administrador bloqueou o app, peça à TI para liberar o Kamban.";
    case "adminBlocked":
      return "O administrador da conta bloqueou este app. Peça à TI para liberar o Kamban.";
    case "notConfigured":
      return "Integração com o Google não configurada neste build.";
    case "offline":
      return "Sem conexão com o Google. Tente de novo.";
    case "revoked":
    case "other":
      return `Não foi possível conectar: ${error.message ?? "erro desconhecido"}`;
  }
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
}

export interface FetchRequest {
  email: string;
  mode: AccountMode;
  calendarIds: string[];
}

export interface FetchResult {
  email: string;
  items?: AgendaItem[];
  error?: AgendaError;
}

export interface CalendarService {
  isConfigured(): Promise<boolean>;
  /** Abre o navegador para autorizar e devolve o e-mail. Rejeita com AgendaError. */
  connect(mode: AccountMode): Promise<string>;
  disconnect(email: string): Promise<void>;
  listCalendars(email: string): Promise<CalendarInfo[]>;
  /** O erro de cada conta vem no próprio FetchResult. */
  fetchDay(requests: FetchRequest[], dayStart: string, dayEnd: string): Promise<FetchResult[]>;
}

export interface AgendaSettings {
  getCalendarAccounts(): Promise<CalendarAccount[]>;
  setCalendarAccounts(accounts: CalendarAccount[]): Promise<void>;
}

/** read/write nunca rejeitam. */
export interface AgendaCacheStore {
  read(): Promise<AgendaCache | null>;
  write(cache: AgendaCache): Promise<void>;
}

export type AccountStatus = "ok" | "offline" | "revoked" | "error";

export interface AgendaDeps {
  service: CalendarService;
  settings: AgendaSettings;
  cache: AgendaCacheStore;
  clock: Pick<Clock, "now" | "today" | "newId">;
  staleAfterMs?: number;
}

export interface AgendaState {
  ready: boolean;
  configured: boolean;
  accounts: CalendarAccount[];
  cache: AgendaCache | null;
  status: Record<string, AccountStatus>;
  /** Mensagem do último erro de leitura de cada conta com status "error" (id da conta → mensagem). */
  errors: Record<string, string>;
  lastRefreshAt: string | null;
  refreshing: boolean;
  connecting: boolean;
  message: string | null;
  now: string;
  today: string;
}

export interface AgendaActions {
  init(): Promise<void>;
  refresh(): Promise<void>;
  refreshIfOlderThan(ms: number): Promise<void>;
  /** Chamado a cada minuto: busca de novo na virada do dia ou quando os dados passam de 15 min. */
  tick(): Promise<void>;
  connect(mode: AccountMode): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  toggleCalendar(accountId: string, calendarId: string): Promise<void>;
  setColor(accountId: string, color: AgendaColor): Promise<void>;
  dismissMessage(): void;
}

export type AgendaStoreState = AgendaState & AgendaActions;
export type AgendaStore = StoreApi<AgendaStoreState>;

export const STALE_AFTER_MS = 15 * 60_000;

function requestFor(account: CalendarAccount): FetchRequest {
  return {
    email: account.email,
    mode: account.mode,
    calendarIds: account.mode === "details" ? account.calendars.filter((c) => c.selected).map((c) => c.id) : ["primary"],
  };
}

function sameRequest(a: FetchRequest, b: FetchRequest): boolean {
  return (
    a.email === b.email &&
    a.mode === b.mode &&
    a.calendarIds.length === b.calendarIds.length &&
    a.calendarIds.every((id, i) => id === b.calendarIds[i])
  );
}

export function createAgendaStore(deps: AgendaDeps): AgendaStore {
  const { service, settings, clock } = deps;
  const staleAfterMs = deps.staleAfterMs ?? STALE_AFTER_MS;
  let refreshAgain = false;

  return createStore<AgendaStoreState>()((set, get) => {
    async function saveAccounts(accounts: CalendarAccount[]) {
      set({ accounts });
      try {
        await settings.setCalendarAccounts(accounts);
      } catch (error) {
        set({ message: `Não foi possível salvar as contas da agenda: ${String(error)}` });
      }
    }

    async function saveCache(cache: AgendaCache) {
      set({ cache });
      await deps.cache.write(cache);
    }

    async function dropCachedAccount(accountId: string) {
      const cache = get().cache;
      if (!cache || !(accountId in cache.accounts)) return;
      const accounts = { ...cache.accounts };
      delete accounts[accountId];
      await saveCache({ ...cache, accounts });
    }

    return {
      ready: false,
      configured: false,
      accounts: [],
      cache: null,
      status: {},
      errors: {},
      lastRefreshAt: null,
      refreshing: false,
      connecting: false,
      message: null,
      now: clock.now(),
      today: clock.today(),

      async init() {
        const [configured, accounts, cache] = await Promise.all([
          service.isConfigured().catch(() => false),
          settings.getCalendarAccounts().catch(() => [] as CalendarAccount[]),
          deps.cache.read(),
        ]);
        const today = clock.today();
        set({ ready: true, configured, accounts, cache: cache?.date === today ? cache : null, today, now: clock.now() });
        await get().refresh();
      },

      async refresh() {
        if (get().refreshing) {
          refreshAgain = true;
          return;
        }
        const today = clock.today();
        set({ now: clock.now(), today });
        const requested = get().accounts;
        if (requested.length === 0) return;
        set({ refreshing: true });
        try {
          const { start, end } = dayBounds(today);
          let results: FetchResult[];
          try {
            results = await service.fetchDay(requested.map(requestFor), start, end);
          } catch (error) {
            // A chamada inteira falhou (antes de falar com o Google): trata como sem conexão.
            const failure: AgendaError = { kind: "offline", message: toAgendaError(error).message };
            results = requested.map((a) => ({ email: a.email, error: failure }));
          }
          const current = get().cache;
          const entries = { ...(current?.date === today ? current.accounts : {}) };
          const status = { ...get().status };
          const errors = { ...get().errors };
          const fetchedAt = clock.now();
          const present = get().accounts;
          for (const account of present) {
            const result = results.find((r) => r.email === account.email);
            if (!result) continue;
            // O modo ou as agendas mudaram durante a busca: este resultado é do pedido antigo
            // (pode ter títulos de uma conta que agora é "Só horários"). A próxima busca já está na fila.
            const sent = requested.find((a) => a.id === account.id);
            if (!sent || !sameRequest(requestFor(sent), requestFor(account))) continue;
            delete errors[account.id];
            const kind = result.error?.kind;
            if (result.items) {
              entries[account.id] = { fetchedAt, items: result.items };
              status[account.id] = "ok";
            } else if (kind === "revoked") {
              delete entries[account.id];
              status[account.id] = "revoked";
            } else if (kind === "offline" || kind === "timeout") {
              status[account.id] = "offline";
            } else {
              status[account.id] = "error";
              errors[account.id] = `Não foi possível ler a agenda: ${result.error?.message ?? kind ?? "erro desconhecido"}`;
            }
          }
          const ids = new Set(present.map((a) => a.id));
          for (const id of Object.keys(entries)) if (!ids.has(id)) delete entries[id];
          for (const id of Object.keys(status)) if (!ids.has(id)) delete status[id];
          for (const id of Object.keys(errors)) if (!ids.has(id)) delete errors[id];
          await saveCache({ date: today, accounts: entries });
          set({ status, errors, lastRefreshAt: fetchedAt, now: fetchedAt });
        } finally {
          set({ refreshing: false });
          if (refreshAgain) {
            refreshAgain = false;
            await get().refresh();
          }
        }
      },

      async refreshIfOlderThan(ms) {
        const last = get().lastRefreshAt;
        const now = clock.now();
        if (last && Date.parse(now) - Date.parse(last) < ms) {
          set({ now });
          return;
        }
        await get().refresh();
      },

      async tick() {
        if (clock.today() !== get().today) {
          await get().refresh();
          return;
        }
        await get().refreshIfOlderThan(staleAfterMs);
      },

      async connect(mode) {
        if (get().connecting) return;
        set({ connecting: true, message: null });
        try {
          const email = await service.connect(mode);
          let calendars: CalendarAccount["calendars"] = [];
          if (mode === "details") {
            try {
              calendars = (await service.listCalendars(email)).map((c) => ({ id: c.id, name: c.name, selected: c.primary }));
            } catch (error) {
              const failure = toAgendaError(error);
              set({ message: `Conta conectada, mas não foi possível listar as agendas: ${failure.message ?? failure.kind}` });
              calendars = [{ id: "primary", name: "Principal", selected: true }];
            }
          }
          const accounts = get().accounts;
          const existing = accounts.find((a) => a.email === email);
          const account: CalendarAccount = {
            id: existing?.id ?? clock.newId(),
            email,
            mode,
            color: existing?.color ?? nextColor(accounts),
            calendars,
          };
          await saveAccounts(existing ? accounts.map((a) => (a.id === existing.id ? account : a)) : [...accounts, account]);
          const status = { ...get().status };
          delete status[account.id];
          const errors = { ...get().errors };
          delete errors[account.id];
          set({ status, errors });
          // COMP-04: ao reconectar (por exemplo em "Só horários"), o cache antigo da conta pode ter títulos.
          if (existing) await dropCachedAccount(existing.id);
          await get().refresh();
        } catch (error) {
          set({ message: connectErrorMessage(toAgendaError(error)) });
        } finally {
          set({ connecting: false });
        }
      },

      async disconnect(accountId) {
        const account = get().accounts.find((a) => a.id === accountId);
        if (!account) return;
        try {
          await service.disconnect(account.email);
        } catch (error) {
          const failure = toAgendaError(error);
          set({
            message: `A conta saiu do app, mas a permissão pode ter ficado nas Chaves do macOS: ${failure.message ?? failure.kind}`,
          });
        }
        await saveAccounts(get().accounts.filter((a) => a.id !== accountId));
        const status = { ...get().status };
        delete status[accountId];
        const errors = { ...get().errors };
        delete errors[accountId];
        set({ status, errors });
        await dropCachedAccount(accountId);
      },

      async toggleCalendar(accountId, calendarId) {
        await saveAccounts(
          get().accounts.map((a) =>
            a.id === accountId
              ? { ...a, calendars: a.calendars.map((c) => (c.id === calendarId ? { ...c, selected: !c.selected } : c)) }
              : a,
          ),
        );
        // Sem rede, a agenda desmarcada não pode continuar aparecendo pelo cache.
        await dropCachedAccount(accountId);
        await get().refresh();
      },

      async setColor(accountId, color) {
        await saveAccounts(get().accounts.map((a) => (a.id === accountId ? { ...a, color } : a)));
      },

      dismissMessage: () => set({ message: null }),
    };
  });
}
