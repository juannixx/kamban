import { homeDir, join } from "@tauri-apps/api/path";
import { ask, message, open } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { isAllowedDataDir } from "./dataDir";
import type { Platform } from "./platform";

const ICLOUD_DRIVE = "Library/Mobile Documents/com~apple~CloudDocs";
const OUTSIDE_HOME_MESSAGE =
  "Escolha uma pasta dentro da sua pasta pessoal (por exemplo, no iCloud Drive ou em Documentos).";

export const tauriPlatform: Platform = {
  async pickFolder() {
    const home = await homeDir();
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Escolha a pasta de dados do Kamban",
      defaultPath: await join(home, ICLOUD_DRIVE),
    });
    if (typeof selected !== "string") return null;
    if (!isAllowedDataDir(selected, home)) {
      await message(OUTSIDE_HOME_MESSAGE, { title: "Kamban", kind: "warning" });
      return null;
    }
    return selected;
  },
  confirm: (text) => ask(text, { title: "Kamban", kind: "warning" }),
  revealFolder: (path) => revealItemInDir(path),
  openUrl: (url) => openUrl(url),
};
