"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { buttonClass } from "./button";
import { cn } from "@/lib/cn";

/** Formulaire relié à une Server Action, avec retour d'erreur / succès intégré. */
export function ActionForm({
  action, children, className, resetOnSuccess = false, onSuccess,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
    if (state?.redirect) router.push(state.redirect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <p className="mt-3 rounded-lg bg-clay-100 px-3 py-2 text-sm text-clay-700" role="alert">{state.error}</p>}
      {state?.ok && <p className="mt-3 rounded-lg bg-sage-100 px-3 py-2 text-sm text-sage-700" role="status">{state.ok}</p>}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, name, value, formNoValidate }: {
  children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle" | "success" | "warning"; size?: "sm" | "md" | "lg"; className?: string; name?: string; value?: string; formNoValidate?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} formNoValidate={formNoValidate} disabled={pending} className={cn(buttonClass(variant, size, className))}>
      {pending ? "Enregistrement…" : children}
    </button>
  );
}

/**
 * « Annuler les modifications » (revient à la dernière version enregistrée) ou
 * « Refaire à zéro » (vide un brouillon). Demande toujours confirmation.
 */
export function FormReset({ mode }: { mode: "edit" | "new" }) {
  const edit = mode === "edit";
  function onClick(ev: React.MouseEvent<HTMLButtonElement>) {
    const form = ev.currentTarget.form;
    if (!form) return;
    if (!window.confirm(edit ? "Annuler les modifications et revenir à la dernière version enregistrée ?" : "Tout effacer et recommencer ce formulaire ?")) return;
    if (edit) { form.reset(); return; }
    for (const el of Array.from(form.elements)) {
      if (el instanceof HTMLInputElement) {
        if (["hidden", "submit", "button", "file"].includes(el.type)) continue;
        if (el.type === "checkbox" || el.type === "radio") el.checked = false; else el.value = "";
      } else if (el instanceof HTMLTextAreaElement) el.value = "";
      else if (el instanceof HTMLSelectElement) el.selectedIndex = 0;
      else continue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  return (
    <button type="button" onClick={onClick} className={buttonClass("ghost", "md")}>
      {edit ? "Annuler les modifications" : "Refaire à zéro"}
    </button>
  );
}
