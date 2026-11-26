import Link from "next/link";
import { Contact, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/dates";
import type { Client } from "@/lib/clients";
import type { EventRow } from "@/lib/types";
import { ContactButtons } from "../fournisseurs/contact-buttons";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  await requirePerm(["clients.manage", "events.manage", "finance.view"]);
  const supabase = await createClient();
  const [{ data }, { data: ev }] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("events").select("id, client_id, event_date, name, status").not("client_id", "is", null).order("event_date"),
  ]);
  const q = (sp.q ?? "").trim().toLowerCase();
  const list = ((data ?? []) as Client[]).filter((c) => !q || [c.name, c.contact_name, c.phone, c.email].some((v) => (v ?? "").toLowerCase().replace(/\s/g, "").includes(q.replace(/\s/g, ""))));
  const today = todayISO();
  const events = (ev ?? []) as Pick<EventRow, "id" | "client_id" | "event_date" | "name" | "status">[];
  const next = new Map<string, (typeof events)[number]>();
  const count = new Map<string, number>();
  for (const e of events) {
    count.set(e.client_id!, (count.get(e.client_id!) ?? 0) + 1);
    if (e.event_date >= today && e.status !== "annule" && !next.has(e.client_id!)) next.set(e.client_id!, e);
  }

  return (
    <>
      <PageHeader title="Clients" subtitle="Chaque client avec ses événements, ses devis et ses factures."
        actions={<ButtonLink href="/clients/nouveau" size="lg"><Plus className="h-5 w-5" /> Nouveau client</ButtonLink>} />
      <form className="relative mb-6 max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input name="q" defaultValue={sp.q} placeholder="Chercher un nom ou un numéro…" className="field h-12 pl-12 text-base" />
      </form>
      {list.length === 0 ? <Card><Empty icon={<Contact className="h-8 w-8" />} title={q ? "Aucun client trouvé." : "Pas encore de client."}>Ajoutez-le ici ou en créant un événement.</Empty></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => {
            const n = next.get(c.id);
            return (
              <Card key={c.id} className="flex flex-col p-5">
                <Link href={`/clients/${c.id}`} className="block flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-lg font-semibold leading-snug">{c.name}</p>
                    {c.kind === "entreprise" && <Badge tone="mist" dot={false}>Entreprise</Badge>}
                  </div>
                  {c.contact_name && <p className="text-sm text-ink-500">{c.contact_name}</p>}
                  <p className="mt-1 text-sm text-ink-400">{count.get(c.id) ?? 0} événement(s){n ? ` · prochain : ${n.name}, ${formatDate(n.event_date)}` : ""}</p>
                </Link>
                <div className="mt-4"><ContactButtons s={c} /></div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
