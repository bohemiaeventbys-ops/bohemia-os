import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/connexion", "/installation", "/kiosque"];
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS|BlackBerry/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Le pointage n'est jamais accessible depuis un téléphone ou une tablette.
  if (pathname.startsWith("/kiosque") && MOBILE_UA.test(request.headers.get("user-agent") ?? "")) {
    const url = request.nextUrl.clone();
    url.pathname = "/pointage-ordinateur";
    return NextResponse.rewrite(url);
  }

  // Configuration incomplète : on l'explique clairement au lieu de planter.
  const missing = [
    !/^https:\/\/.+\.supabase\.co$/.test(supabaseUrl()) && "NEXT_PUBLIC_SUPABASE_URL",
    !supabaseAnonKey() && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean) as string[];
  if (missing.length) return configError(missing);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    user = null; // Supabase injoignable : on traite comme « non connecté ».
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) || pathname === "/pointage-ordinateur";
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = pathname !== "/" ? `?suite=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return response;
}

function configError(missing: string[]) {
  const items = missing.map((m) => `<li><code>${m}</code></li>`).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BOHEMIA OS : configuration</title></head>
<body style="font-family:system-ui,sans-serif;background:#F7F2EB;color:#2b2420;padding:24px;max-width:560px;margin:auto">
<h1 style="font-size:22px">Configuration à compléter</h1>
<p>Le site ne trouve pas ces clés (ou elles sont mal copiées) :</p><ul>${items}</ul>
<p>Ajoutez-les dans l'hébergeur (Vercel : Settings → Environment Variables), puis relancez un déploiement (Deployments → ⋯ → Redeploy).</p>
</body></html>`;
  return new NextResponse(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
