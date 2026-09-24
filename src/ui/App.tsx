import { Centered } from "./Centered";
import { useApp } from "./context";
import { Notice } from "./Notice";
import { ChooseFolder } from "./screens/ChooseFolder";
import { LoadErrorScreen } from "./screens/LoadErrorScreen";
import { Shell } from "./Shell";

export function App() {
  const phase = useApp((s) => s.phase);
  return (
    <>
      {phase === "booting" && (
        <Centered>
          <p className="text-sm text-zinc-500">Carregando…</p>
        </Centered>
      )}
      {phase === "choose-folder" && <ChooseFolder />}
      {phase === "load-error" && <LoadErrorScreen />}
      {phase === "ready" && <Shell />}
      <Notice />
    </>
  );
}
