import { notFound } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDayLong } from "@/lib/dates";
import { PROOF_BUCKET, type DesignProof } from "@/lib/clients";
import { clientDecide } from "./actions";

export const metadata = { title: "Votre maquette · Bohemia Events", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClientValidation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{36}$/.test(token)) notFound();
  const admin = createAdminClient();
  const { data } = await admin.from("design_proofs").select("*").eq("share_token", token).maybeSingle();
  const p = data as DesignProof | null;
  if (!p || p.status === "annule") notFound();
  const [{ data: e }, { data: signed }] = await Promise.all([
    admin.from("events").select("name, event_date").eq("id", p.event_id).single(),
    admin.storage.from(PROOF_BUCKET).createSignedUrl(p.file_path, 60 * 60),
  ]);
  const url = signed?.signedUrl;
  const isPdf = p.file_path.endsWith(".pdf");

  return (
    <main className="min-h-dvh bg-ivory px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center">
          <p className="font-display text-3xl font-semibold tracking-[0.18em]">BOHEMIA</p>
          <p className="text-[11px] uppercase tracking-[0.35em] text-ink-400">Events</p>
        </header>
        <div className="card overflow-hidden">
          <div className="px-5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">Maquette à valider</p>
            <h1 className="mt-1 font-display text-3xl font-semibold">{p.title}</h1>
            {e && <p className="text-ink-500">{e.name} · {formatDayLong(e.event_date)}</p>}
            {p.note && <p className="mt-3 whitespace-pre-line rounded-xl bg-sand-50 p-3 text-sm">{p.note}</p>}
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="mt-4 block bg-sand-50">
            {isPdf ? <span className="flex h-48 items-center justify-center font-semibold text-ink-600">Ouvrir la maquette (PDF)</span>
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={url} alt={p.title} className="w-full object-contain" />}
          </a>
          <div className="p-5">
            {p.status === "a_valider" ? (
              <ActionForm action={clientDecide} className="space-y-3">
                <input type="hidden" name="token" value={token} />
                <SubmitButton name="decision" value="ok" variant="success" size="lg" className="w-full text-lg"><Check className="h-6 w-6" /> Je valide cette maquette</SubmitButton>
                <details className="rounded-xl border border-line p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-center gap-2 font-semibold text-ink-600"><Pencil className="h-4 w-4" /> Je souhaite une modification</summary>
                  <div className="mt-3 space-y-3">
                    <textarea name="comment" rows={3} className="field" placeholder="Ex. Mettre les prénoms plus gros, changer le rose pour un beige…" />
                    <SubmitButton name="decision" value="non" variant="secondary" size="lg" className="w-full">Envoyer ma demande</SubmitButton>
                  </div>
                </details>
              </ActionForm>
            ) : (
              <p className={`rounded-xl p-4 text-center font-semibold ${p.status === "valide" ? "bg-sage-100 text-sage-700" : "bg-ochre-100 text-ochre-700"}`}>
                {p.status === "valide" ? "Maquette validée, merci ! La fabrication est lancée." : "Votre demande de modification est bien reçue. Nous vous envoyons une nouvelle version très vite."}
              </p>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-ink-400">Une question ? Répondez simplement à notre message WhatsApp.</p>
      </div>
    </main>
  );
}
