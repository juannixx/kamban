import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { Platform } from "../platform/platform";
import type { AppStore, AppStoreState } from "../store/appStore";

const StoreContext = createContext<AppStore | null>(null);
const PlatformContext = createContext<Platform | null>(null);

export function AppProvider({ store, platform, children }: { store: AppStore; platform: Platform; children: ReactNode }) {
  return (
    <StoreContext.Provider value={store}>
      <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
    </StoreContext.Provider>
  );
}

/** Selecione só valores estáveis (um campo do estado ou uma ação). Derive o resto com useMemo. */
export function useApp<T>(selector: (state: AppStoreState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useApp precisa estar dentro de AppProvider");
  return useStore(store, selector);
}

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error("usePlatform precisa estar dentro de AppProvider");
  return platform;
}
