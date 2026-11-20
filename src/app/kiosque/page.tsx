import { createAdminClient } from "@/lib/supabase/admin";
import { getKioskToken } from "@/lib/kiosk";
import { KioskApp, type KioskEmployee } from "./kiosk-app";

export const metadata = { title: "Kiosque de pointage" };
export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const token = await getKioskToken();
  let employees: KioskEmployee[] | null = null;
  if (token) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("kiosk_employees", { p_token: token });
    if (!error && data) {
      const rows = data as (KioskEmployee & { photo_path: string | null })[];
      const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
      const urls = new Map<string, string>();
      if (paths.length) {
        const { data: signed } = await admin.storage.from("avatars").createSignedUrls(paths, 3600 * 12);
        for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
      }
      employees = rows.map((r) => ({ ...r, photo_url: r.photo_path ? urls.get(r.photo_path) ?? null : null }));
    }
  }

  if (!employees) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory p-8">
        <div className="max-w-lg text-center">
          <p className="font-display text-4xl text-ink">Poste non autorisé</p>
          <p className="mt-4 text-sm leading-relaxed text-ink-500">
            Ce navigateur n&apos;est pas enregistré comme kiosque de pointage. Un administrateur doit se connecter sur cet ordinateur,
            puis aller dans <strong>Paramètres → Postes de pointage</strong> et cliquer sur « Enregistrer cet ordinateur ».
          </p>
          <a href="/connexion?suite=/parametres/kiosques" className="mt-8 inline-block text-sm text-taupe-600 underline underline-offset-4">Connexion administrateur</a>
        </div>
      </div>
    );
  }
  return <KioskApp initialEmployees={employees} />;
}
