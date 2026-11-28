import Link from "next/link";
import { BrandPanel } from "@/components/layout/brand-panel";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { createAdminClient } from "@/lib/supabase/admin";
import { signIn } from "./actions";
import { LangSwitch } from "@/components/layout/lang-switch";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";

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
  const lang = await getLang();
  return (
    <BrandPanel title={t(lang, "login.title")} subtitle={t(lang, "login.subtitle")}>
      {sp.erreur === "compte" && (
        <p className="mb-5 rounded-lg bg-ochre-100 px-3 py-2 text-sm text-ochre-700">Votre compte n&apos;est relié à aucune fiche employé active. Contactez la direction.</p>
      )}
      <div className="mb-6 flex justify-center"><LangSwitch lang={lang} /></div>
      <ActionForm action={signIn} className="space-y-4">
        <input type="hidden" name="suite" value={sp.suite ?? ""} />
        <Field label={t(lang, "login.email")}><Input name="email" type="email" autoComplete="email" required autoFocus /></Field>
        <Field label={t(lang, "login.password")}><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <SubmitButton className="w-full" size="lg">{t(lang, "login.submit")}</SubmitButton>
      </ActionForm>
      {needsSetup && (
        <div className="mt-8 rounded-xl border border-line bg-paper p-4 text-sm text-ink-500">
          Première utilisation ? <Link href="/installation" className="link font-medium">Créer le compte Direction</Link>
        </div>
      )}
      <p className="mt-10 text-xs text-ink-300">{t(lang, "login.kiosk")}</p>
    </BrandPanel>
  );
}
