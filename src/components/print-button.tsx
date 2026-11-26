"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "./ui/button";

export function PrintButton({ label = "Imprimer / PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "md", "print:hidden")}>
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
