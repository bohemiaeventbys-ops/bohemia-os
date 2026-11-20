import type { ReactNode } from "react";

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-taupe-300">{icon}</div>}
      <p className="text-sm font-medium text-ink-500">{title}</p>
      {children && <div className="mt-1 text-xs text-ink-400">{children}</div>}
    </div>
  );
}
