import type { Priority } from "../domain/schema";
import { PRIORITY_CLASS, PRIORITY_LABEL } from "./format";

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_CLASS[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
