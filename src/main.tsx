import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { systemClock } from "./platform/clock";
import { createTauriSettings } from "./platform/settings";
import { tauriFs } from "./platform/tauriFs";
import { tauriPlatform } from "./platform/tauriPlatform";
import { attachWindowLifecycle } from "./platform/windowLifecycle";
import { createAppStore } from "./store/appStore";
import { App } from "./ui/App";
import { AppProvider } from "./ui/context";

async function start() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Elemento #root não encontrado");

  const store = createAppStore({ fs: tauriFs, settings: await createTauriSettings(), clock: systemClock });
  createRoot(root).render(
    <StrictMode>
      <AppProvider store={store} platform={tauriPlatform}>
        <App />
      </AppProvider>
    </StrictMode>,
  );
  await attachWindowLifecycle(store, getCurrentWindow(), tauriPlatform.confirm);
  await store.getState().boot();
}

void start();
