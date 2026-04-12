import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShareLink } from "@/features/media/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Shared Content",
};

function vehicleLabel(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}) {
  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");

  return label || "Vehicle";
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveShareLink(token);

  if (!resolved) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Shared Content
        </p>
        <h1 className="text-2xl font-bold">PerfectPPI Share Link</h1>
      </div>

      {resolved.target.type === "media_package" ? (
        <Card>
          <CardHeader>
            <CardTitle>{resolved.target.media_package.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {resolved.target.media_package.description ? (
              <p className="text-sm text-muted-foreground">
                {resolved.target.media_package.description}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {resolved.target.media_package.items.map((item, index) => (
                <div
                  key={`${item.url}-${index}`}
                  className="rounded-lg border p-3 bg-muted/20"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {item.type}
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline break-all"
                  >
                    {item.name || item.url}
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {resolved.target.type === "inspection_result" ? (
        <Card>
          <CardHeader>
            <CardTitle>Inspection Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Status: <span className="font-semibold">{resolved.target.submission.status}</span>
            </p>
            <p>
              Submitted:{" "}
              <span className="font-semibold">
                {resolved.target.submission.submitted_at
                  ? new Date(resolved.target.submission.submitted_at).toLocaleString()
                  : "Not submitted"}
              </span>
            </p>
            {resolved.target.request ? (
              <p>
                Inspection Type:{" "}
                <span className="font-semibold">{resolved.target.request.ppi_type}</span>
              </p>
            ) : null}
            {resolved.target.vehicle ? (
              <p>
                Vehicle:{" "}
                <span className="font-semibold">
                  {vehicleLabel(resolved.target.vehicle)}
                </span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {resolved.target.type === "standardized_output" ? (
        <Card>
          <CardHeader>
            <CardTitle>Standardized Inspection Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {resolved.target.vehicle ? (
              <p>
                Vehicle:{" "}
                <span className="font-semibold">
                  {vehicleLabel(resolved.target.vehicle)}
                </span>
              </p>
            ) : null}

            <p>
              Generated:{" "}
              <span className="font-semibold">
                {new Date(resolved.target.standardized_output.generated_at).toLocaleString()}
              </span>
            </p>

            {resolved.target.standardized_output.document_url ? (
              <Button asChild>
                <a
                  href={`/api/outputs/${resolved.target.standardized_output.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Document
                </a>
              </Button>
            ) : (
              <p className="text-muted-foreground">Document URL is not available.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          Back to PerfectPPI
        </Link>
      </div>
    </div>
  );
}
