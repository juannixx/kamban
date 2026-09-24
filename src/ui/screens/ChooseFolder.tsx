import { Centered } from "../Centered";
import { useApp, usePlatform } from "../context";
import { btnPrimary } from "../styles";

export function ChooseFolder() {
  const openFolder = useApp((s) => s.openFolder);
  const { pickFolder } = usePlatform();

  async function choose() {
    const dir = await pickFolder();
    if (dir) await openFolder(dir);
  }

  return (
    <Centered>
      <h1 className="text-xl font-semibold">Onde guardar seus dados?</h1>
      <p className="max-w-md text-sm text-zinc-500">
        Escolha uma pasta para o arquivo kamban.json. Uma pasta no iCloud Drive mantém uma cópia sincronizada e com versões
        anteriores. Se a pasta já tiver um kamban.json, ele será aberto.
      </p>
      <button type="button" className={btnPrimary} onClick={() => void choose()}>
        Escolher pasta
      </button>
    </Centered>
  );
}
