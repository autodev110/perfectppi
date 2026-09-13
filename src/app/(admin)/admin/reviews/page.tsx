import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import {
  getAdminPpiServiceDisputes,
  resolvePpiServiceDisputeAction,
  SERVICE_DISPUTE_REASON_LABELS,
} from "@/features/reviews/disputes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";

type QueueDispute = Awaited<ReturnType<typeof getAdminPpiServiceDisputes>>[number] & {
  requester?: { display_name: string | null; username: string | null } | null;
  technician?: { profile?: { display_name: string | null; username: string | null } | null } | null;
  request?: { id: string; vehicle?: { year: number | null; make: string | null; model: string | null } | null } | null;
};

export default async function AdminReviewDisputesPage({ searchParams }: { searchParams: Promise<{ error?: string; resolved?: string }> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const disputes = await getAdminPpiServiceDisputes("open") as QueueDispute[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Inspection Review Disputes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Private inspection concerns that must be decided before a linked technician review can return to public ratings.</p>
      </div>
      {params.error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</p> : null}
      {params.resolved ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Dispute resolved and audit history recorded.</p> : null}
      {disputes.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No open inspection disputes.</CardContent></Card>
      ) : disputes.map((dispute) => {
        const vehicle = dispute.request?.vehicle;
        const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Inspection";
        const requester = dispute.requester?.display_name ?? dispute.requester?.username ?? "Requester";
        const technician = dispute.technician?.profile?.display_name ?? dispute.technician?.profile?.username ?? "Technician";
        return (
          <Card key={dispute.id}>
            <CardHeader><CardTitle className="text-lg">{vehicleName}</CardTitle><p className="text-sm text-muted-foreground">{requester} · technician: {technician} · opened {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dispute.opened_at))}</p></CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg bg-muted p-4 text-sm"><p className="font-semibold">{SERVICE_DISPUTE_REASON_LABELS[dispute.reason_code as keyof typeof SERVICE_DISPUTE_REASON_LABELS] ?? dispute.reason_code}</p><p className="mt-2 whitespace-pre-wrap">{dispute.details}</p></div>
              <Button variant="outline" asChild><Link href={`/admin/inspections/${dispute.ppi_request_id}`}>Open inspection</Link></Button>
              <form action={resolvePpiServiceDisputeAction} className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
                <input type="hidden" name="dispute_id" value={dispute.id} />
                <label className="text-sm font-semibold">Decision<select name="status" className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal"><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label>
                <label className="text-sm font-semibold">Outcome<select name="outcome" className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal"><option value="customer_supported">Customer supported</option><option value="technician_supported">Technician supported</option><option value="partial_resolution">Partial resolution</option><option value="no_finding">No finding</option></select></label>
                <label className="text-sm font-semibold md:col-span-2">Public review<select name="restore_review" className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal" defaultValue="" required><option value="" disabled>Choose what happens to the review</option><option value="true">Restore review if it was hidden by this dispute</option><option value="false">Keep review hidden</option></select></label>
                <label className="text-sm font-semibold md:col-span-2">Private resolution note<Textarea name="resolution_note" minLength={10} maxLength={2000} required rows={4} className="mt-2 font-normal" /></label>
                <Button type="submit" className="md:col-span-2">Record decision</Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
