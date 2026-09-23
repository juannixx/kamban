import { Centered } from "../Centered";
import { useApp, usePlatform } from "../context";
import { btn, btnPrimary } from "../styles";

export function LoadErrorScreen() {
  const loadError = useApp((s) => s.loadError);
  const dataDir = useApp((s) => s.dataDir);
  const restoreBackup = useApp((s) => s.restoreBackup);
  const openFolder = useApp((s) => s.openFolder);
  const { pickFolder } = usePlatform();
  const future = loadError?.error === "future-version";

  async function chooseOther() {
    const dir = await pickFolder();
    if (dir) await openFolder(dir);
  }

  return (
    <Centered>
      <h1 className="text-xl font-semibold">
        {future ? "Este arquivo é de uma versão mais nova do Kamban" : "Não foi possível abrir seus dados"}
      </h1>
      <p className="max-w-lg text-sm text-zinc-500">
        Pasta: <code>{dataDir}</code>. O arquivo não foi alterado.
        {future && " Atualize o app para abri-lo."}
      </p>
      {loadError && (
        <pre className="max-h-48 max-w-lg overflow-auto rounded-md bg-zinc-100 p-3 text-left text-xs whitespace-pre-wrap dark:bg-zinc-900">
          {loadError.message}
        </pre>
      )}
      <div className="flex gap-2">
        {!future && (
          <button type="button" className={btnPrimary} onClick={() => void restoreBackup()}>
            Restaurar último backup
          </button>
        )}
        {dataDir && (
          <button type="button" className={btn} onClick={() => void openFolder(dataDir)}>
            Tentar de novo
          </button>
        )}
        <button type="button" className={btn} onClick={() => void chooseOther()}>
          Escolher outra pasta
        </button>
      </div>
    </Centered>
  );
}
