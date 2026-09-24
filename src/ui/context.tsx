import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { Platform } from "../platform/platform";
import type { AppStore, AppStoreState } from "../store/appStore";
import type { AgendaStore, AgendaStoreState } from "../store/agendaStore";

const StoreContext = createContext<AppStore | null>(null);
const PlatformContext = createContext<Platform | null>(null);
const AgendaContext = createContext<AgendaStore | null>(null);

export function AppProvider({
  store,
  agenda,
  platform,
  children,
}: {
  store: AppStore;
  agenda: AgendaStore;
  platform: Platform;
  children: ReactNode;
}) {
  return (
    <StoreContext.Provider value={store}>
      <AgendaContext.Provider value={agenda}>
        <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
      </AgendaContext.Provider>
    </StoreContext.Provider>
  );
}

/** Selecione só valores estáveis (um campo do estado ou uma ação). Derive o resto com useMemo. */
export function useApp<T>(selector: (state: AppStoreState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useApp precisa estar dentro de AppProvider");
  return useStore(store, selector);
}

/** Mesmas regras do useApp: selecione só valores estáveis. */
export function useAgenda<T>(selector: (state: AgendaStoreState) => T): T {
  const agenda = useContext(AgendaContext);
  if (!agenda) throw new Error("useAgenda precisa estar dentro de AppProvider");
  return useStore(agenda, selector);
}

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error("usePlatform precisa estar dentro de AppProvider");
  return platform;
}
