import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "./user-avatar";
import Link from "next/link";

interface TechCardProps {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  certificationLevel: string;
  totalInspections: number;
  orgName?: string | null;
  specialties?: string[];
  href?: string;
}

export function TechCard({
  displayName,
  avatarUrl,
  certificationLevel,
  totalInspections,
  orgName,
  specialties,
  href,
}: TechCardProps) {
  const content = (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start gap-4 p-6">
        <UserAvatar src={avatarUrl} name={displayName} className="h-12 w-12" />
        <div className="flex-1">
          <p className="font-semibold">{displayName ?? "Technician"}</p>
          {orgName && (
            <p className="text-sm text-muted-foreground">{orgName}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-xs">
              {certificationLevel}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {totalInspections} inspections
            </Badge>
          </div>
          {specialties && specialties.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {specialties.slice(0, 3).map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
