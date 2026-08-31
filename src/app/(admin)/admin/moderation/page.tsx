import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { reviewModerationItem } from "@/features/moderation/actions";
import { getModerationMetrics, getModerationQueue } from "@/features/moderation/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils/formatting";

type PageProps = { searchParams: Promise<{ status?: string }> };

const filters = ["pending_review", "rejected", "legal_hold", "all"] as const;

export default async function ModerationPage({ searchParams }: PageProps) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const status = filters.includes(params.status as (typeof filters)[number])
    ? params.status as (typeof filters)[number]
    : "pending_review";
  const [items, metrics] = await Promise.all([getModerationQueue(status), getModerationMetrics()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Moderation Review</h1>
        <p className="text-muted-foreground">Review flagged posts, comments, media, reports, and appeals.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Approved" value={metrics.active} />
        <Metric label="Needs review" value={metrics.pending_review} />
        <Metric label="Rejected" value={metrics.rejected} />
        <Metric label="Legal hold" value={metrics.legal_hold} />
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {filters.map((filter) => (
          <Button key={filter} size="sm" variant={status === filter ? "default" : "outline"} asChild>
            <Link href={`/admin/moderation?status=${filter}`}>{filter.replaceAll("_", " ")}</Link>
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No items in this queue.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const author = Array.isArray(item.author) ? item.author[0] : item.author;
            const appeals = Array.isArray(item.appeals) ? item.appeals : [];
            return (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{item.entity_type.replaceAll("_", " ")}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {author?.display_name ?? author?.username ?? "PerfectPPI user"} · {formatDate(item.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge>
                      <Badge variant={item.risk_level === "critical" ? "destructive" : "secondary"}>{item.risk_level} risk</Badge>
                      {item.report_count > 0 ? <Badge variant="secondary">{item.report_count} reports</Badge> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {item.entity_type === "community_post_media" ? (
                    item.status === "legal_hold" ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                        Preview is locked for legal-hold content. Follow the approved escalation process.
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/moderation/media/${item.entity_id}`} alt="Moderation preview" className="max-h-80 rounded-xl border object-contain" />
                    )
                  ) : (
                    <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm">{item.content_preview ?? "Content unavailable"}</p>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Reasons: {item.reason_codes.join(", ") || "none"}</span>
                    <span>Provider: {item.model_provider}</span>
                  </div>

                  {appeals.map((appeal) => (
                    <div key={appeal.id} className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                      <strong>Appeal:</strong> {appeal.statement}
                    </div>
                  ))}

                  <form action={reviewModerationItem} className="space-y-3 rounded-xl border p-4">
                    <input type="hidden" name="item_id" value={item.id} />
                    <Textarea name="notes" rows={2} maxLength={1000} placeholder="Internal review notes" />
                    <select name="enforcement" defaultValue="none" className="h-10 rounded-md border bg-background px-3 text-sm">
                      <option value="none">No account action</option>
                      <option value="warning">Issue warning</option>
                      <option value="posting_hold">7-day posting hold</option>
                      <option value="media_hold">7-day media hold</option>
                      <option value="suspension">7-day suspension</option>
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" name="decision" value="approve">Approve</Button>
                      <Button size="sm" variant="destructive" name="decision" value="reject">Reject</Button>
                      <Button size="sm" variant="outline" name="decision" value="legal_hold">Legal hold</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>;
}
