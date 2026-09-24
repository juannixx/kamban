import { BACKUP_DIR, joinPath } from "../../persistence/fs";
import { useApp, usePlatform } from "../context";
import { btn, cardBox, sectionTitle } from "../styles";

export function SettingsView() {
  const dataDir = useApp((s) => s.dataDir);
  const flush = useApp((s) => s.flush);
  const openFolder = useApp((s) => s.openFolder);
  const showNotice = useApp((s) => s.showNotice);
  const { pickFolder, revealFolder } = usePlatform();

  async function changeFolder() {
    const dir = await pickFolder();
    if (!dir || dir === dataDir) return;
    await flush();
    await openFolder(dir);
  }

  async function openBackups() {
    if (!dataDir) return;
    try {
      await revealFolder(joinPath(dataDir, BACKUP_DIR));
    } catch {
      try {
        await revealFolder(dataDir);
      } catch (error) {
        showNotice(`Não foi possível abrir a pasta: ${String(error)}`);
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <section className={`${cardBox} space-y-3 p-4`}>
        <h2 className={sectionTitle}>Pasta de dados</h2>
        <p className="font-mono text-sm break-all">{dataDir}</p>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => void changeFolder()}>
            Trocar pasta
          </button>
          <button type="button" className={btn} onClick={() => void openBackups()}>
            Abrir backups no Finder
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          O app guarda uma cópia por dia em backups/, dentro da pasta, e mantém os últimos 14 dias.
        </p>
      </section>
    </div>
  );
}
