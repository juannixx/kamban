import type { AppStore } from "../store/appStore";

/** Parte da janela do Tauri usada aqui (facilita testar sem Tauri). */
export interface LifecycleWindow {
  onCloseRequested(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<unknown>;
  onFocusChanged(handler: (event: { payload: boolean }) => void): Promise<unknown>;
}

const UNSAVED_MESSAGE = "Algumas alterações não foram salvas. Fechar mesmo assim?";

/**
 * Padrão de commitDrafts: tira o foco do campo em edição. Título, descrição e edição inline
 * só gravam no onBlur, e o React roda o onBlur de forma síncrona dentro de element.blur().
 */
export function commitFocusedDraft(): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

/**
 * Fechar: confirma os rascunhos, grava o que falta; se não der, pergunta antes de fechar.
 * Ganhar foco: confere a data do dia, tenta gravar de novo e detecta alteração externa.
 * Perder foco: confirma os rascunhos e grava (cobre Dock > Encerrar, logout e troca de app).
 * Timer: atualiza o "hoje" para a virada do dia.
 */
export async function attachWindowLifecycle(
  store: AppStore,
  win: LifecycleWindow,
  confirmClose: (message: string) => Promise<boolean>,
  intervalMs = 60_000,
  commitDrafts: () => void = commitFocusedDraft,
): Promise<() => void> {
  await win.onCloseRequested(async (event) => {
    commitDrafts();
    await store.getState().flush();
    const state = store.getState();
    if (state.hasPendingChanges() || state.lastSaveFailed) {
      if (!(await confirmClose(UNSAVED_MESSAGE))) event.preventDefault();
    }
  });
  await win.onFocusChanged(({ payload: focused }) => {
    if (focused) {
      void store.getState().onFocus();
      return;
    }
    commitDrafts();
    void store.getState().flush();
  });
  const timer = setInterval(() => store.getState().refreshToday(), intervalMs);
  return () => clearInterval(timer);
}
