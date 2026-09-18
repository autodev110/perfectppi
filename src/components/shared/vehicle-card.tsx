import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMileage } from "@/lib/utils/formatting";
import Link from "next/link";
import { t as uiText } from "@/lib/i18n";

interface VehicleCardProps {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim?: string | null;
  mileage?: number | null;
  vin?: string | null;
  visibility: "public" | "friends" | "private";
  href?: string;
}

export function VehicleCard({
  year,
  make,
  model,
  trim,
  mileage,
  vin,
  visibility,
  href,
}: VehicleCardProps) {
  const content = (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">
              {year} {make} {model}
            </p>
            {trim && (
              <p className="text-sm text-muted-foreground">{trim}</p>
            )}
          </div>
          <Badge
            variant={visibility === "public" ? "default" : "secondary"}
          >
            {visibility === "private" ? uiText("ui.only_me_bdc0857b99") : visibility === "friends" ? uiText("ui.friends_bd104d1b98") : uiText("ui.public_591935b15b")}
          </Badge>
        </div>
        {mileage != null && (
          <p className="mt-2 text-sm text-muted-foreground">
            {formatMileage(mileage)}{uiText("ui.miles_9e73814859")}</p>
        )}
        {vin && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">{uiText("ui.vin_5d4e351bed")}{vin}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
