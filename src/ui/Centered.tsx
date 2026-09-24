import type { ReactNode } from "react";

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">{children}</div>;
}
