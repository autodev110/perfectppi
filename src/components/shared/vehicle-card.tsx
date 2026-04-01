import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMileage } from "@/lib/utils/formatting";
import Link from "next/link";

interface VehicleCardProps {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim?: string | null;
  mileage?: number | null;
  vin?: string | null;
  visibility: "public" | "private";
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
            {visibility}
          </Badge>
        </div>
        {mileage != null && (
          <p className="mt-2 text-sm text-muted-foreground">
            {formatMileage(mileage)} miles
          </p>
        )}
        {vin && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            VIN: {vin}
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
