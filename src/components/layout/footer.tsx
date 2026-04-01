import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights
            reserved.
          </p>
          <nav className="flex gap-6">
            <Link
              href="/technicians"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Technicians
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
