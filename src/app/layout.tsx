import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./globals.css";
import { getLang } from "@/lib/lang";
import { dir } from "@/lib/i18n";

export const metadata: Metadata = {
  title: { default: "BOHEMIA OS", template: "%s · BOHEMIA OS" },
  description: "Plateforme de gestion interne de Bohemia Events",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={dir(lang)}>
      <body>{children}</body>
    </html>
  );
}
