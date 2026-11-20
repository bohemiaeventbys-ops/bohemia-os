import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getSession } from "@/lib/auth";
import { buildNav } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/connexion?erreur=compte");
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const urls = await signedUrls(supabase, "avatars", [session.employee.photo_path]);
  const nav = buildNav(session);
  return (
    <div className="min-h-screen">
      <Sidebar {...nav} unread={count ?? 0} />
      <MobileNav main={nav.main} bottom={nav.bottom} unread={count ?? 0} />
      <div className="lg:pl-64">
        <Topbar employee={session.employee} unread={count ?? 0} photoUrl={session.employee.photo_path ? urls.get(session.employee.photo_path) ?? null : null} />
        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
