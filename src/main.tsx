import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "./index.css";
import { systemClock } from "./platform/clock";
import { createTauriSettings } from "./platform/settings";
import { tauriFs } from "./platform/tauriFs";
import { tauriPlatform } from "./platform/tauriPlatform";
import { attachWindowLifecycle } from "./platform/windowLifecycle";
import { createAppStore } from "./store/appStore";
import { App } from "./ui/App";
import { AppProvider } from "./ui/context";
import { renderFatalError } from "./ui/fatalError";

const maybeRoot = document.getElementById("root");
if (!maybeRoot) throw new Error("Elemento #root não encontrado");
/** Tipado sem `| null`: closures abaixo não recuperam o estreitamento de `maybeRoot`. */
const rootElement: HTMLElement = maybeRoot;

let reactRoot: Root | null = null;

async function start() {
  const store = createAppStore({ fs: tauriFs, settings: await createTauriSettings(), clock: systemClock });
  reactRoot = createRoot(rootElement);
  reactRoot.render(
    <StrictMode>
      <AppProvider store={store} platform={tauriPlatform}>
        <App />
      </AppProvider>
    </StrictMode>,
  );
  await attachWindowLifecycle(store, getCurrentWindow(), tauriPlatform.confirm);
  await store.getState().boot();
}

start().catch((error: unknown) => {
  reactRoot?.unmount();
  renderFatalError(rootElement, error);
  console.error(error);
});
