import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { siteConfig } from "@/config/site";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/client";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // One catalog ships today, so the document language is fixed and public
  // pages stay statically renderable. When a second catalog lands, swap this
  // for `await getRequestLocale()` (lib/i18n/server) — that is the one change
  // that opts the site into per-request locale negotiation.
  const locale = DEFAULT_LOCALE;
  return (
    <html lang={locale} className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
        >
          Skip to main content
        </a>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        <Toaster />
      </body>
    </html>
  );
}
