import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BackNav } from "@/components/layout/back-nav";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { buildNav } from "@/lib/navigation";
import { getLang } from "@/lib/lang";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/connexion?erreur=compte");
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const urls = await signedUrls(supabase, "avatars", [session.employee.photo_path]);
  const lang = await getLang();
  const nav = buildNav(session, lang);
  return (
    <div className="min-h-screen">
      <Sidebar {...nav} unread={count ?? 0} />
      <MobileNav main={nav.main} bottom={nav.bottom} unread={count ?? 0} moreLabel={t(lang, "nav.plus")} />
      <div className="lg:ps-64 print:ps-0">
        <Topbar lang={lang} employee={session.employee} unread={count ?? 0} photoUrl={session.employee.photo_path ? urls.get(session.employee.photo_path) ?? null : null} />
        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-8 lg:pb-10 lg:pt-8 print:p-0"><Suspense fallback={null}><BackNav label={t(lang, "c.back")} /></Suspense>{children}</main>
      </div>
    </div>
  );
}
