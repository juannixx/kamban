import { useState } from "react";
import { AGENDA_COLORS, type AgendaColor, type CalendarAccount } from "../../domain/agenda";
import { useAgenda, usePlatform } from "../context";
import { AGENDA_COLOR_CLASS, AGENDA_COLOR_NAME } from "../format";
import { btn, btnDanger, btnPrimary, cardBox, input, sectionTitle } from "../styles";

export function GoogleAccounts() {
  const configured = useAgenda((s) => s.configured);
  const accounts = useAgenda((s) => s.accounts);
  const connecting = useAgenda((s) => s.connecting);
  const message = useAgenda((s) => s.message);
  const connect = useAgenda((s) => s.connect);
  const dismissMessage = useAgenda((s) => s.dismissMessage);
  const [choosing, setChoosing] = useState(false);

  if (!configured) {
    return (
      <section aria-label="Agenda do Google" className={`${cardBox} space-y-2 p-4`}>
        <h2 className={sectionTitle}>Agenda do Google</h2>
        <p className="text-sm text-zinc-500">Integração com o Google não configurada neste build.</p>
      </section>
    );
  }

  return (
    <section aria-label="Agenda do Google" className={`${cardBox} space-y-3 p-4`}>
      <h2 className={sectionTitle}>Agenda do Google</h2>
      <p className="text-xs text-zinc-500">
        O app só lê a agenda. Contas em "Só horários" não recebem títulos nem detalhes dos eventos.
      </p>
      {message && (
        <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="flex-1">{message}</p>
          <button type="button" className={btn} onClick={dismissMessage}>
            Fechar
          </button>
        </div>
      )}
      {accounts.length > 0 && (
        <ul aria-label="Contas conectadas" className="space-y-3">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </ul>
      )}
      {choosing ? (
        <div role="group" aria-label="Como conectar" className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              setChoosing(false);
              void connect("details");
            }}
          >
            Com detalhes
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setChoosing(false);
              void connect("busy");
            }}
          >
            Só horários, sem títulos
          </button>
          <button type="button" className={btn} onClick={() => setChoosing(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className={btn} disabled={connecting} onClick={() => setChoosing(true)}>
          {connecting ? "Aguardando o navegador…" : "Conectar conta"}
        </button>
      )}
    </section>
  );
}

function AccountRow({ account }: { account: CalendarAccount }) {
  const status = useAgenda((s) => s.status[account.id]);
  const connect = useAgenda((s) => s.connect);
  const disconnect = useAgenda((s) => s.disconnect);
  const toggleCalendar = useAgenda((s) => s.toggleCalendar);
  const setColor = useAgenda((s) => s.setColor);
  const { confirm } = usePlatform();

  async function remove() {
    if (await confirm(`Desconectar ${account.email}? A permissão será apagada deste Mac.`)) {
      await disconnect(account.id);
    }
  }

  return (
    <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${AGENDA_COLOR_CLASS[account.color]}`} />
        <span className="text-sm font-medium">{account.email}</span>
        <span className="text-xs text-zinc-500">{account.mode === "busy" ? "Só horários" : "Com detalhes"}</span>
        <select
          aria-label={`Cor de ${account.email}`}
          className={`${input} w-auto`}
          value={account.color}
          onChange={(e) => void setColor(account.id, e.target.value as AgendaColor)}
        >
          {AGENDA_COLORS.map((color) => (
            <option key={color} value={color}>
              {AGENDA_COLOR_NAME[color]}
            </option>
          ))}
        </select>
        <button type="button" className={`${btnDanger} ml-auto`} onClick={() => void remove()}>
          Desconectar
        </button>
      </div>
      {status === "revoked" && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <p>Permissão expirada.</p>
          <button type="button" className={btn} onClick={() => void connect(account.mode)}>
            Reconectar
          </button>
        </div>
      )}
      {account.mode === "details" && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-zinc-500">Agendas</legend>
          {account.calendars.map((calendar) => (
            <label key={calendar.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={calendar.selected}
                onChange={() => void toggleCalendar(account.id, calendar.id)}
              />
              {calendar.name}
            </label>
          ))}
        </fieldset>
      )}
    </li>
  );
}
