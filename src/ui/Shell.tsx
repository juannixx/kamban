import { BoardView } from "./board/BoardView";
import { CardPanel } from "./card/CardPanel";
import { ConflictDialog } from "./ConflictDialog";
import { useApp } from "./context";
import { HabitsView } from "./habits/HabitsView";
import { SettingsView } from "./settings/SettingsView";
import { Sidebar } from "./Sidebar";
import { TodayView } from "./today/TodayView";

export function Shell() {
  const view = useApp((s) => s.view);
  const selectedCardId = useApp((s) => s.selectedCardId);
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        {view.type === "today" && <TodayView />}
        {view.type === "board" && <BoardView key={view.boardId} boardId={view.boardId} />}
        {view.type === "habits" && <HabitsView />}
        {view.type === "settings" && <SettingsView />}
      </main>
      {selectedCardId && <CardPanel cardId={selectedCardId} />}
      <ConflictDialog />
    </div>
  );
}
