import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { NotificationRow } from "@/lib/types";
import { markAllNotificationsRead } from "@/app/actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const sp = await searchParams;
  await requireSession();
  const supabase = await createClient();
  let q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
  if (sp.vue !== "toutes") q = q.is("read_at", null);
  const { data } = await q;
  const list = (data ?? []) as NotificationRow[];
  return (
    <>
      <PageHeader eyebrow="Centre de notifications" title="Notifications"
        actions={<form action={markAllNotificationsRead}><Button variant="secondary" size="sm">Tout marquer comme lu</Button></form>} />
      <Tabs active={sp.vue === "toutes" ? "toutes" : "non-lues"} items={[{ key: "non-lues", label: "Non lues", href: "/notifications" }, { key: "toutes", label: "Toutes", href: "/notifications?vue=toutes" }]} />
      <Card>
        {list.length === 0 ? <Empty title="Aucune notification." /> : (
          <ul className="divide-y divide-line">
            {list.map((n) => (
              <li key={n.id}>
                <Link href={`/notifications/${n.id}`} prefetch={false} className={cn("flex items-start gap-3 px-5 py-3.5 transition hover:bg-sand-50", n.read_at && "opacity-60")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-clay-500")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-sm text-ink-500">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-ink-300">{relativeTime(n.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
