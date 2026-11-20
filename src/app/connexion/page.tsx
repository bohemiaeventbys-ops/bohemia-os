import Link from "next/link";
import { BrandPanel } from "@/components/layout/brand-panel";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { createAdminClient } from "@/lib/supabase/admin";
import { signIn } from "./actions";

export const metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function ConnexionPage({ searchParams }: { searchParams: Promise<{ suite?: string; erreur?: string }> }) {
  const sp = await searchParams;
  let needsSetup = false;
  try {
    const admin = createAdminClient();
    const { count, error } = await admin.from("employees").select("id", { count: "exact", head: true }).eq("role", "admin").not("user_id", "is", null);
    needsSetup = !error && (count ?? 0) === 0;
  } catch {
    needsSetup = false;
  }
  return (
    <BrandPanel title="Connexion" subtitle="Accédez à votre espace de travail.">
      {sp.erreur === "compte" && (
        <p className="mb-5 rounded-lg bg-ochre-100 px-3 py-2 text-sm text-ochre-700">Votre compte n&apos;est relié à aucune fiche employé active. Contactez la direction.</p>
      )}
      <ActionForm action={signIn} className="space-y-4">
        <input type="hidden" name="suite" value={sp.suite ?? ""} />
        <Field label="Email"><Input name="email" type="email" autoComplete="email" required autoFocus /></Field>
        <Field label="Mot de passe"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <SubmitButton className="w-full" size="lg">Se connecter</SubmitButton>
      </ActionForm>
      {needsSetup && (
        <div className="mt-8 rounded-xl border border-line bg-white p-4 text-sm text-ink-500">
          Première utilisation ? <Link href="/installation" className="link font-medium">Créer le compte Direction</Link>
        </div>
      )}
      <p className="mt-10 text-xs text-ink-300">Le pointage se fait uniquement sur le poste kiosque de l&apos;entreprise.</p>
    </BrandPanel>
  );
}
