import type { AppStore } from "../store/appStore";

/** Parte da janela do Tauri usada aqui (facilita testar sem Tauri). */
export interface LifecycleWindow {
  onCloseRequested(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<unknown>;
  onFocusChanged(handler: (event: { payload: boolean }) => void): Promise<unknown>;
}

const UNSAVED_MESSAGE = "Algumas alterações não foram salvas. Fechar mesmo assim?";

/**
 * Fechar: grava o que falta; se não der, pergunta antes de fechar.
 * Foco: confere a data do dia, tenta gravar de novo e detecta alteração externa.
 * Timer: atualiza o "hoje" para a virada do dia.
 */
export async function attachWindowLifecycle(
  store: AppStore,
  win: LifecycleWindow,
  confirmClose: (message: string) => Promise<boolean>,
  intervalMs = 60_000,
): Promise<() => void> {
  await win.onCloseRequested(async (event) => {
    await store.getState().flush();
    const state = store.getState();
    if (state.hasPendingChanges() || state.lastSaveFailed) {
      if (!(await confirmClose(UNSAVED_MESSAGE))) event.preventDefault();
    }
  });
  await win.onFocusChanged(({ payload: focused }) => {
    if (focused) void store.getState().onFocus();
  });
  const timer = setInterval(() => store.getState().refreshToday(), intervalMs);
  return () => clearInterval(timer);
}
