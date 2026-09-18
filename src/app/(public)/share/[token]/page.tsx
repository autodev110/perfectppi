import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShareLink } from "@/features/media/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: uiText("ui.shared_content_71dcb79381"),
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

  return label || uiText("ui.vehicle_a62394ba4a");
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const uiText = await getRequestTranslator();
  const { token } = await params;
  const resolved = await resolveShareLink(token);

  if (!resolved) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{uiText("ui.shared_content_71dcb79381")}</p>
        <h1 className="text-2xl font-bold">{uiText("ui.perfectppi_share_link_b7d614d140")}</h1>
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
            <CardTitle>{uiText("ui.inspection_result_00131bfbae")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>{uiText("ui.status_4889951f61")}<span className="font-semibold">{resolved.target.submission.status}</span>
            </p>
            <p>{uiText("ui.submitted_f1bd0eb561")}{" "}
              <span className="font-semibold">
                {resolved.target.submission.submitted_at
                  ? new Date(resolved.target.submission.submitted_at).toLocaleString()
                  : uiText("ui.not_submitted_d3289e6252")}
              </span>
            </p>
            {resolved.target.request ? (
              <p>{uiText("ui.inspection_type_dec0e02265")}{" "}
                <span className="font-semibold">{resolved.target.request.ppi_type}</span>
              </p>
            ) : null}
            {resolved.target.vehicle ? (
              <p>{uiText("ui.vehicle_b2dc3b5dae")}{" "}
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
            <CardTitle>{uiText("ui.standardized_inspection_output_5bb9cdb2b2")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {resolved.target.vehicle ? (
              <p>{uiText("ui.vehicle_b2dc3b5dae")}{" "}
                <span className="font-semibold">
                  {vehicleLabel(resolved.target.vehicle)}
                </span>
              </p>
            ) : null}

            <p>{uiText("ui.generated_c710717519")}{" "}
              <span className="font-semibold">
                {new Date(resolved.target.standardized_output.generated_at).toLocaleString()}
              </span>
            </p>

            {resolved.target.standardized_output.document_url ? (
              <Button asChild>
                <a
                  href={resolved.target.standardized_output.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >{uiText("ui.open_document_ec4bc99aad")}</a>
              </Button>
            ) : (
              <p className="text-muted-foreground">{uiText("ui.document_url_is_not_available_dfb826428c")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Link href="/" className="text-sm font-medium text-primary hover:underline">{uiText("ui.back_to_perfectppi_d9084b0fa4")}</Link>
      </div>
    </div>
  );
}
