import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Shield, Users } from "lucide-react";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-heading text-4xl font-bold tracking-tight text-primary sm:text-5xl lg:text-6xl">
            Professional Vehicle Inspections You Can Trust
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Standardized pre-purchase inspections with detailed reports and
            vehicle service contract options. Inspect yourself or connect with a
            certified technician.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/technicians">Find a Technician</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                <ClipboardCheck className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                Guided Inspections
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Step-by-step mobile-first inspection workflow with direct camera
                capture across 12 vehicle sections.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                <Shield className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                Vehicle Service Contracts
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                AI-generated coverage options based on your inspection results.
                Review, sign, and purchase — all in one place.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                <Users className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                Certified Technicians
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Browse our directory and assign inspections to verified
                technicians for professional-grade results.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
