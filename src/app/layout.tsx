import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { siteConfig } from "@/config/site";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";
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
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
        >
          Skip to main content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
