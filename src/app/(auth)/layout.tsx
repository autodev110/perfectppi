import Link from "next/link";
import { Shield, BadgeCheck, Fingerprint } from "lucide-react";
import { PageReveal } from "@/components/shared/page-reveal";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6 relative">
      {/* Background texture */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary-container/5 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-on-tertiary-container/5 rounded-full blur-[120px]" />
      </div>

      <main className="w-full max-w-[1100px] grid md:grid-cols-2 bg-surface-container-lowest rounded-[2rem] shadow-2xl overflow-hidden min-h-[700px]">
        {/* Left — Branding panel */}
        <section className="hidden md:flex flex-col justify-between p-12 bg-primary-container text-white relative overflow-hidden">
          <div className="relative z-10">
            <Link
              href="/"
              className="text-2xl font-heading font-black tracking-tighter mb-12 block"
            >
              PerfectPPI
            </Link>
            <h1 className="font-heading font-extrabold text-5xl tracking-tight leading-none mb-6">
              The Standard
              <br />
              for Verified
              <br />
              Vehicle Trust.
            </h1>
            <p className="text-on-primary-container text-lg max-w-sm font-medium leading-relaxed">
              Verify provenance. Secure your investment. Access the industry
              standard for Pre-Purchase Inspections.
            </p>
          </div>

          {/* Asymmetric image */}
          <div className="relative mt-12 rounded-2xl overflow-hidden aspect-[4/3] shadow-2xl" style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 0% 100%)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDsNFgtjwRGmA2rZzZ_-kEuYzMsT5XGVYrAFdyNy8gLt6J-WkKYLemSgNcHWYcaaf1nOWvMb58XW9VgQxtGD4Iw_KHXhL7anXDPhKk8AHio9HQzy3LfXMDIYMkCnsvdhr_h5Acl26_U6ASbvWsAUN-imZlddqIFFraj7w0-I5MWf6844OhAHwVOK9JSlTCUGV-n5QUd4hf3hr654fe0Nz3dOw0hQsuHXmn3yv2_M6w5qG3TBEDrteGw6Wes9JIssqhr7Y8lM92UTQ"
              alt="Sport car engine detail"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary-container/80 to-transparent" />
          </div>

          <div className="relative z-10 flex items-center gap-6 text-on-primary-container/40 mt-8">
            <Shield className="h-6 w-6" />
            <BadgeCheck className="h-6 w-6" />
            <Fingerprint className="h-6 w-6" />
          </div>
        </section>

        {/* Right — Auth form */}
        <section className="flex flex-col justify-center px-8 md:px-16 py-12 bg-surface-container-lowest">
          <PageReveal className="max-w-md mx-auto w-full">
            {/* Mobile branding */}
            <Link
              href="/"
              className="md:hidden text-2xl font-heading font-black tracking-tighter text-primary-container mb-8 block"
            >
              PerfectPPI
            </Link>
            {children}
          </PageReveal>
        </section>
      </main>
    </div>
  );
}
