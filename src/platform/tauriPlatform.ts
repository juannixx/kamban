import { homeDir, join } from "@tauri-apps/api/path";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Platform } from "./platform";

const ICLOUD_DRIVE = "Library/Mobile Documents/com~apple~CloudDocs";

export const tauriPlatform: Platform = {
  async pickFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Escolha a pasta de dados do Kamban",
      defaultPath: await join(await homeDir(), ICLOUD_DRIVE),
    });
    return typeof selected === "string" ? selected : null;
  },
  confirm: (message) => ask(message, { title: "Kamban", kind: "warning" }),
  revealFolder: (path) => revealItemInDir(path),
  openUrl: (url) => openUrl(url),
};
