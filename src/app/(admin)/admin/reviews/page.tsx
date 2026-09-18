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

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type QueueDispute = Awaited<ReturnType<typeof getAdminPpiServiceDisputes>>[number] & {
  requester?: { display_name: string | null; username: string | null } | null;
  technician?: { profile?: { display_name: string | null; username: string | null } | null } | null;
  request?: { id: string; vehicle?: { year: number | null; make: string | null; model: string | null } | null } | null;
};

export default async function AdminReviewDisputesPage({ searchParams }: { searchParams: Promise<{ error?: string; resolved?: string }> }) {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const params = await searchParams;
  const disputes = await getAdminPpiServiceDisputes("open") as QueueDispute[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.inspection_review_disputes_be9e7021d0")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.private_inspection_concerns_that_must_be_dec_b9e7a783b9")}</p>
      </div>
      {params.error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</p> : null}
      {params.resolved ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{uiText("ui.dispute_resolved_and_audit_history_recorded_d59291fb45")}</p> : null}
      {disputes.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{uiText("ui.no_open_inspection_disputes_df200fdf3f")}</CardContent></Card>
      ) : disputes.map((dispute) => {
        const vehicle = dispute.request?.vehicle;
        const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || uiText("ui.inspection_6e4fa13da4");
        const requester = dispute.requester?.display_name ?? dispute.requester?.username ?? uiText("ui.requester_b5687cf04a");
        const technician = dispute.technician?.profile?.display_name ?? dispute.technician?.profile?.username ?? uiText("ui.technician_9041ccc417");
        return (
          <Card key={dispute.id}>
            <CardHeader><CardTitle className="text-lg">{vehicleName}</CardTitle><p className="text-sm text-muted-foreground">{requester}{uiText("ui.technician_1bcbe89c38")}{technician}{uiText("ui.opened_c0345de361")}{new Intl.DateTimeFormat(uiText("ui.en_dbd3a49d0d"), { dateStyle: "medium", timeStyle: "short" }).format(new Date(dispute.opened_at))}</p></CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg bg-muted p-4 text-sm"><p className="font-semibold">{SERVICE_DISPUTE_REASON_LABELS[dispute.reason_code as keyof typeof SERVICE_DISPUTE_REASON_LABELS] ?? dispute.reason_code}</p><p className="mt-2 whitespace-pre-wrap">{dispute.details}</p></div>
              <Button variant="outline" asChild><Link href={`/admin/inspections/${dispute.ppi_request_id}`}>{uiText("ui.open_inspection_8e231e5f94")}</Link></Button>
              <form action={resolvePpiServiceDisputeAction} className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
                <input type="hidden" name="dispute_id" value={dispute.id} />
                <label className="text-sm font-semibold">{uiText("ui.decision_640ae4baf9")}<select name="status" className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal"><option value="resolved">{uiText("ui.resolved_5be3c2c835")}</option><option value="dismissed">{uiText("ui.dismissed_9d74727714")}</option></select></label>
                <label className="text-sm font-semibold">{uiText("ui.outcome_4e80abb5b1")}<select name="outcome" className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal"><option value="customer_supported">{uiText("ui.customer_supported_d1ff1b2288")}</option><option value="technician_supported">{uiText("ui.technician_supported_76dd3467c9")}</option><option value="partial_resolution">{uiText("ui.partial_resolution_7d33b0383a")}</option><option value="no_finding">{uiText("ui.no_finding_9c93d7a8f3")}</option></select></label>
                <label className="text-sm font-semibold md:col-span-2">{uiText("ui.public_review_33fe121edc")}<select name="restore_review" className="mt-2 h-10 w-full rounded-md border bg-background px-3 font-normal" defaultValue="" required><option value="" disabled>{uiText("ui.choose_what_happens_to_the_review_0cda46a876")}</option><option value="true">{uiText("ui.restore_review_if_it_was_hidden_by_this_disp_75b7a30ff4")}</option><option value="false">{uiText("ui.keep_review_hidden_0d5132bd7b")}</option></select></label>
                <label className="text-sm font-semibold md:col-span-2">{uiText("ui.private_resolution_note_b6cc291d39")}<Textarea name="resolution_note" minLength={10} maxLength={2000} required rows={4} className="mt-2 font-normal" /></label>
                <Button type="submit" className="md:col-span-2">{uiText("ui.record_decision_0eb246db50")}</Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
