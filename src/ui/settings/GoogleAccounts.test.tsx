// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarAccount } from "../../domain/agenda";
import { setupApp } from "../testing";
import { GoogleAccounts } from "./GoogleAccounts";

afterEach(cleanup);

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
const accountsList = () => within(screen.getByRole("list", { name: "Contas conectadas" }));

describe("GoogleAccounts", () => {
  it("build sem credencial mostra o aviso e não permite conectar", async () => {
    await setupApp(<GoogleAccounts />, { agenda: { service: { isConfigured: vi.fn(async () => false) } } });
    expect(screen.getByText("Integração com o Google não configurada neste build.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar conta" })).toBeNull();
  });

  it("conecta com detalhes e lista as agendas", async () => {
    const { user, agendaService } = await setupApp(<GoogleAccounts />, {
      agenda: {
        service: {
          listCalendars: vi.fn(async () => [
            { id: "primary", name: "Pessoal", primary: true },
            { id: "familia", name: "Família", primary: false },
          ]),
        },
      },
    });
    expect(screen.getByText(/O app só lê a agenda/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Conectar conta" }));
    await user.click(screen.getByRole("button", { name: "Com detalhes" }));
    await waitFor(() => accountsList().getByText("pessoal@gmail.com"));
    expect(agendaService.connect).toHaveBeenCalledWith("details");
    expect(accountsList().getByText("Com detalhes")).toBeTruthy();
    expect((accountsList().getByRole("checkbox", { name: "Pessoal" }) as HTMLInputElement).checked).toBe(true);
    expect((accountsList().getByRole("checkbox", { name: "Família" }) as HTMLInputElement).checked).toBe(false);
  });

  it("conecta em só horários, sem lista de agendas", async () => {
    const { user } = await setupApp(<GoogleAccounts />, {
      agenda: { service: { connect: vi.fn(async () => "voce@yousalaw.com") } },
    });
    await user.click(screen.getByRole("button", { name: "Conectar conta" }));
    await user.click(screen.getByRole("button", { name: "Só horários, sem títulos" }));
    await waitFor(() => accountsList().getByText("voce@yousalaw.com"));
    expect(accountsList().getByText("Só horários")).toBeTruthy();
    expect(accountsList().queryByRole("checkbox")).toBeNull();
  });

  it("cancelar a escolha de modo não conecta", async () => {
    const { user, agendaService } = await setupApp(<GoogleAccounts />);
    await user.click(screen.getByRole("button", { name: "Conectar conta" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(agendaService.connect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Conectar conta" })).toBeTruthy();
  });

  it("marca agendas, troca a cor e desconecta com confirmação", async () => {
    const { user, agenda, platform } = await setupApp(<GoogleAccounts />, { agenda: { accounts: [pessoal] } });
    await user.click(accountsList().getByRole("checkbox", { name: "Feriados" }));
    await waitFor(() => expect(agenda.getState().accounts[0]?.calendars[1]?.selected).toBe(true));
    await user.selectOptions(accountsList().getByRole("combobox", { name: "Cor de pessoal@gmail.com" }), "amber");
    await waitFor(() => expect(agenda.getState().accounts[0]?.color).toBe("amber"));
    await user.click(accountsList().getByRole("button", { name: "Desconectar" }));
    await waitFor(() => expect(agenda.getState().accounts).toEqual([]));
    expect(platform.confirm).toHaveBeenCalledOnce();
  });

  it("mostra o erro de conexão e permite fechar", async () => {
    const { user } = await setupApp(<GoogleAccounts />, {
      agenda: { service: { connect: vi.fn(async () => Promise.reject({ kind: "adminBlocked" })) } },
    });
    await user.click(screen.getByRole("button", { name: "Conectar conta" }));
    await user.click(screen.getByRole("button", { name: "Só horários, sem títulos" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("O administrador da conta bloqueou este app.");
    await user.click(within(alert).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("conta com erro de leitura mostra a mensagem", async () => {
    await setupApp(<GoogleAccounts />, {
      agenda: {
        accounts: [pessoal],
        service: {
          fetchDay: vi.fn(async () => [
            { email: "pessoal@gmail.com", error: { kind: "other" as const, message: "Google respondeu 403" } },
          ]),
        },
      },
    });
    const message = accountsList().getByText("Não foi possível ler a agenda: Google respondeu 403");
    expect(message.tagName).toBe("P");
    expect(message.className).toContain("text-red");
  });

  it("conta com permissão expirada oferece reconectar no mesmo modo", async () => {
    const { user, agendaService } = await setupApp(<GoogleAccounts />, {
      agenda: {
        accounts: [pessoal],
        service: { fetchDay: vi.fn(async () => [{ email: "pessoal@gmail.com", error: { kind: "revoked" as const } }]) },
      },
    });
    expect(accountsList().getByText("Permissão expirada.")).toBeTruthy();
    await user.click(accountsList().getByRole("button", { name: "Reconectar" }));
    await waitFor(() => expect(agendaService.connect).toHaveBeenCalledWith("details"));
  });
});
