import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <Link
        href="/"
        className="mb-8 font-heading text-2xl font-bold text-primary"
      >
        {siteConfig.name}
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
