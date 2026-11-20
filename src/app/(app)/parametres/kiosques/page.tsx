import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { buttonClass } from "@/components/ui/button";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { clientIp, getKioskToken } from "@/lib/kiosk";
import { formatDateTime } from "@/lib/dates";
import { registerKiosk, toggleKiosk } from "../actions";

export default async function KiosksSettings() {
  await requirePerm("settings.manage");
  const supabase = await createClient();
  const { data: kiosks } = await supabase.from("kiosk_devices").select("*").order("created_at");
  const hasCookie = !!(await getKioskToken());
  const ip = await clientIp();
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader title="Postes de pointage autorisés" subtitle="Seuls ces ordinateurs peuvent afficher le kiosque. Les téléphones sont refusés." />
        {!kiosks?.length ? <Empty title="Aucun poste enregistré." /> : (
          <table className="table-base">
            <thead><tr><th>Poste</th><th>Créé le</th><th>Dernière activité</th><th>Restriction IP</th><th>État</th><th /></tr></thead>
            <tbody>
              {kiosks.map((k) => (
                <tr key={k.id}>
                  <td className="font-medium">{k.name}</td>
                  <td className="text-ink-500">{formatDateTime(k.created_at)}</td>
                  <td className="text-ink-500">{formatDateTime(k.last_seen_at)}</td>
                  <td colSpan={3}>
                    <ActionForm action={toggleKiosk} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={k.id} />
                      <Input name="allowed_ip" defaultValue={k.allowed_ip ?? ""} placeholder="Aucune" className="h-8 w-36 py-0 text-xs" />
                      <Badge tone={k.is_active ? "sage" : "neutral"}>{k.is_active ? "Actif" : "Révoqué"}</Badge>
                      <SubmitButton size="sm" variant="secondary" name="active" value={k.is_active ? "1" : "0"}>Enregistrer</SubmitButton>
                      <SubmitButton size="sm" variant={k.is_active ? "danger" : "secondary"} name="active" value={k.is_active ? "0" : "1"}>{k.is_active ? "Révoquer" : "Réactiver"}</SubmitButton>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <CardHeader title="Enregistrer cet ordinateur" subtitle="À faire une seule fois, depuis l'ordinateur de pointage." />
        <CardBody className="space-y-4">
          {hasCookie && <p className="rounded-lg bg-sage-100 px-3 py-2 text-sm text-sage-700">Ce navigateur est déjà enregistré comme kiosque. <Link href="/kiosque" className="underline">Ouvrir le kiosque</Link></p>}
          <ActionForm action={registerKiosk} className="space-y-3">
            <Field label="Nom du poste"><Input name="name" placeholder="Ex. Accueil atelier" required /></Field>
            <Field label="Restreindre à l'IP du bureau (facultatif)" hint={ip ? `Votre IP actuelle : ${ip}` : undefined}><Input name="allowed_ip" placeholder={ip ?? ""} /></Field>
            <SubmitButton>Enregistrer cet ordinateur</SubmitButton>
          </ActionForm>
          <p className="text-xs leading-relaxed text-ink-400">Un jeton secret est stocké dans ce navigateur (cookie non lisible par JavaScript) et seule son empreinte est conservée en base. Conseil : ouvrez ensuite <strong>/kiosque</strong> en plein écran (F11) et déconnectez votre session administrateur.</p>
          <Link href="/kiosque" className={buttonClass("secondary", "sm")}>Ouvrir le kiosque</Link>
        </CardBody>
      </Card>
    </div>
  );
}
