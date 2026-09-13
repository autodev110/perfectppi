import { PublicNavbar } from "@/components/layout/public-navbar";
import { Footer } from "@/components/layout/footer";
import { PageReveal } from "@/components/shared/page-reveal";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <PublicNavbar />
      <main id="main-content" tabIndex={-1} className="flex-1 pt-16 outline-none">
        <PageReveal>{children}</PageReveal>
      </main>
      <Footer />
    </div>
  );
}
