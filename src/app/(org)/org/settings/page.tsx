import { getMyOrg, getOrgTechnicians } from "@/features/organizations/queries";
import { requireRole } from "@/features/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils/formatting";
import { Building2, Users, Link as LinkIcon, Hash } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function OrgSettingsPage() {
  await requireRole(["org_manager"]);

  const org = await getMyOrg();
  if (!org) redirect("/login");

  const technicians = await getOrgTechnicians(org.id);
  const managerCount = technicians.filter(() => false).length; // managers tracked via org_memberships
  const techCount = technicians.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground">Manage your organization configuration.</p>
      </div>

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Organization Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Name</p>
              <p className="mt-1 font-semibold">{org.name}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Created</p>
              <p className="mt-1">{formatDate(org.created_at)}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Slug</p>
                <p className="font-mono text-sm text-muted-foreground">{org.slug}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Used in your public organization URL. Set at creation and cannot be changed.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Organization ID</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{org.id}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              To update your name, description, or logo, go to the Profile page.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/org/profile">Edit Profile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Membership */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Membership
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Technicians</p>
              <p className="mt-1 text-2xl font-bold">{techCount}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Membership Policy</p>
              <div className="mt-1">
                <Badge variant="secondary">Invite only</Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  Technicians join only when you add them from the directory.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Add or remove technicians from your roster.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/org/technicians">Manage Technicians</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
