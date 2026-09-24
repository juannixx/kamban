/** Serviços do sistema usados pela interface. A UI nunca importa Tauri diretamente. */
export interface Platform {
  /** Abre o seletor de pasta. Devolve o caminho escolhido ou null se cancelado. */
  pickFolder(): Promise<string | null>;
  confirm(message: string): Promise<boolean>;
  /** Mostra a pasta no Finder. */
  revealFolder(path: string): Promise<void>;
  /** Abre um link no navegador padrão. */
  openUrl(url: string): Promise<void>;
}
