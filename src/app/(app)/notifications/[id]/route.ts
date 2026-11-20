import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Ouvre une notification : la marque comme lue puis redirige vers l'élément concerné. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("link").maybeSingle();
  const link = data?.link && data.link.startsWith("/") ? data.link : "/notifications";
  return NextResponse.redirect(new URL(link, request.url));
}
