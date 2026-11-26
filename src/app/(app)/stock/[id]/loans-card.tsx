import { Wrench } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input, Select } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { addDays, diffDays, formatDate, formatDayShort, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/format";
import type { StockItem, ToolLoan } from "@/lib/stock";
import type { Employee } from "@/lib/types";
import { lendTool, returnTool } from "../actions";

/** Qui a pris l'outil (visseuse, perceuse…) et quand il revient. */
export async function LoansCard({ item, canMove }: { item: StockItem; canMove: boolean }) {
  const supabase = await createClient();
  const [{ data: ln }, { data: emp }] = await Promise.all([
    supabase.from("tool_loans").select("*").eq("item_id", item.id).is("returned_at", null).order("taken_at"),
    supabase.from("employees").select("*").eq("status", "actif").order("first_name"),
  ]);
  const loans = (ln ?? []) as ToolLoan[];
  const people = (emp ?? []) as Employee[];
  const byId = new Map(people.map((p) => [p.id, p]));
  const out = loans.reduce((a, l) => a + l.qty, 0);
  const free = item.qty_good - out;
  const today = todayISO();

  return (
    <Card>
      <CardHeader icon={<Wrench />} tone="mist" title="Qui l'a pris ?" subtitle={`${free > 0 ? free : 0} au dépôt · ${out} sorti${out > 1 ? "s" : ""}`} />
      {loans.length > 0 && (
        <ul className="divide-y divide-line">
          {loans.map((l) => {
            const late = l.due_back ? diffDays(l.due_back, today) < 0 : false;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{fullName(byId.get(l.employee_id))}{l.qty > 1 ? ` · ×${l.qty}` : ""}</span>
                  <span className={`block text-sm ${late ? "font-semibold text-clay-700" : "text-ink-500"}`}>
                    Pris le {formatDate(l.taken_at.slice(0, 10))}{l.due_back ? ` · ${late ? "devait revenir" : "revient"} le ${formatDayShort(l.due_back)}` : ""}
                  </span>
                </span>
                {canMove && (
                  <ActionForm action={returnTool} className="flex gap-2">
                    <input type="hidden" name="loan_id" value={l.id} /><input type="hidden" name="id" value={item.id} />
                    <SubmitButton name="state" value="ok" variant="success" size="sm">Rendu</SubmitButton>
                    <SubmitButton name="state" value="abime" variant="danger" size="sm">Rendu abîmé</SubmitButton>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canMove && free > 0 && (
        <ActionForm action={lendTool} resetOnSuccess className="border-t border-line bg-sand-50/60 px-5 py-4">
          <input type="hidden" name="id" value={item.id} />
          <div className="grid gap-2 sm:grid-cols-[1fr_5rem_10rem_auto]">
            <Select name="employee_id" required defaultValue=""><option value="" disabled>Qui le prend ?</option>{people.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</Select>
            <Input name="qty" type="number" min={1} max={free} defaultValue={1} className="text-center" aria-label="Combien" />
            <Input name="due_back" type="date" min={today} defaultValue={addDays(today, 1)} aria-label="Revient le" />
            <SubmitButton>Il le prend</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Card>
  );
}
