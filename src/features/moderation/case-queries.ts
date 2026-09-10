import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import type { CapabilitySet } from "./capabilities";

// Case-driven moderation queue and detail (plan 18.2 / 18.3). Reporter
// identity is attached only when the caller holds reporter_identity_read;
// everything else is safe for any queue reader.

type CaseRow = Database["public"]["Tables"]["moderation_cases"]["Row"];
type ProfileSummary = { id: string; display_name: string | null; username: string | null };

export const QUEUE_TABS = ["new", "in_review", "escalated", "appeals", "closed"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export const QUEUE_TAB_LABELS: Record<QueueTab, string> = {
  new: "New reports",
  in_review: "In review",
  escalated: "Escalated / legal",
  appeals: "Appeals",
  closed: "Closed",
};

export type QueueCase = CaseRow & {
  author: ProfileSummary | null;
  assignee: ProfileSummary | null;
  reportCount: number;
  reasonCodes: string[];
  hasMedia: boolean;
  priorViolations: number;
  hasAppeal: boolean;
  claimLive: boolean;
  slaOverdue: boolean;
  contentPreview: string | null;
};

async function profilesById(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map<string, ProfileSummary>();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, display_name, username")
    .in("id", unique);
  return new Map((data ?? []).map((row) => [row.id, row]));
}

export async function getModerationQueueCases(tab: QueueTab): Promise<QueueCase[]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  let query = admin.from("moderation_cases").select("*");

  // A claim that has lapsed counts as new work again (plan 20.2).
  switch (tab) {
    case "new":
      query = query.or(`state.in.(open,monitoring),and(state.eq.claimed,claim_expires_at.lte.${now})`);
      break;
    case "in_review":
      query = query.eq("state", "claimed").gt("claim_expires_at", now);
      break;
    case "escalated":
      query = query.eq("state", "escalated");
      break;
    case "appeals":
      query = query.eq("state", "appeal_open");
      break;
    case "closed":
      query = query.eq("state", "closed");
      break;
  }

  const { data: fetched, error } = await (tab === "closed"
    ? query.order("closed_at", { ascending: false })
    : query.order("sla_due_at", { ascending: true }).order("created_at", { ascending: true })
  ).limit(100);
  if (error) throw new Error(error.message);
  if (!fetched?.length) return [];
  // Plan 18.2: risk priority first, then oldest first. `priority` is text, so
  // rank it here rather than trusting alphabetical order.
  const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
  const cases = tab === "closed"
    ? fetched
    : [...fetched].sort((a, b) =>
        (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9)
        || a.sla_due_at.localeCompare(b.sla_due_at)
        || a.created_at.localeCompare(b.created_at));

  const caseIds = cases.map((row) => row.id);
  const itemIds = cases.map((row) => row.moderation_item_id);
  const [{ data: items }, { data: reports }, { data: appeals }] = await Promise.all([
    admin.from("moderation_items").select("id, author_id, content_preview, entity_type").in("id", itemIds),
    admin.from("moderation_reports").select("case_id, reason_code").in("case_id", caseIds),
    admin.from("moderation_appeals").select("case_id").in("case_id", caseIds).eq("status", "pending"),
  ]);
  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  const authorIds = [...new Set((items ?? []).map((item) => item.author_id).filter(Boolean))] as string[];
  const [{ data: violations }, { data: mediaCounts }, profiles] = await Promise.all([
    authorIds.length
      ? admin.from("moderation_cases")
        .select("id, moderation_items!inner(author_id)")
        .eq("resolution", "violation_removed")
        .in("moderation_items.author_id", authorIds)
        .not("id", "in", `(${caseIds.join(",")})`)
      : Promise.resolve({ data: [] as Array<{ id: string; moderation_items: { author_id: string | null } | { author_id: string | null }[] }> }),
    admin.from("community_post_media").select("post_id")
      .in("post_id", cases.filter((row) => row.entity_type === "community_post").map((row) => row.entity_id)),
    profilesById([...authorIds, ...cases.map((row) => row.assigned_moderator_id)]),
  ]);
  const priorViolationsByAuthor = new Map<string, number>();
  for (const violation of violations ?? []) {
    const joined = Array.isArray(violation.moderation_items) ? violation.moderation_items[0] : violation.moderation_items;
    const authorId = joined?.author_id;
    if (authorId) priorViolationsByAuthor.set(authorId, (priorViolationsByAuthor.get(authorId) ?? 0) + 1);
  }
  const mediaPosts = new Set((mediaCounts ?? []).map((row) => row.post_id));
  const appealCases = new Set((appeals ?? []).map((row) => row.case_id));

  return cases.map((row) => {
    const item = itemById.get(row.moderation_item_id);
    const caseReports = (reports ?? []).filter((report) => report.case_id === row.id);
    const claimLive = Boolean(row.claim_expires_at && row.claim_expires_at > now);
    return {
      ...row,
      author: item?.author_id ? profiles.get(item.author_id) ?? null : null,
      assignee: row.assigned_moderator_id && claimLive ? profiles.get(row.assigned_moderator_id) ?? null : null,
      reportCount: caseReports.length,
      reasonCodes: [...new Set(caseReports.map((report) => report.reason_code))],
      hasMedia: row.entity_type === "community_post" && mediaPosts.has(row.entity_id),
      priorViolations: item?.author_id ? priorViolationsByAuthor.get(item.author_id) ?? 0 : 0,
      hasAppeal: appealCases.has(row.id),
      claimLive,
      slaOverdue: row.state !== "closed" && row.sla_due_at < now,
      contentPreview: item?.content_preview ?? null,
    };
  });
}

export type CaseDetail = {
  case: CaseRow;
  item: Database["public"]["Tables"]["moderation_items"]["Row"] | null;
  author: ProfileSummary | null;
  assignee: ProfileSummary | null;
  claimLive: boolean;
  evidence: { snapshot: Json; mediaReferences: Json; capturedAt: string; sha256: string } | null;
  currentContent: { content: string; status: string; moderation_status: string; audience?: string | null } | null;
  media: Array<{ id: string; media_type: string; moderation_status: string }>;
  reports: Array<{
    id: string;
    reason_code: string;
    details: string | null;
    created_at: string;
    reporter: ProfileSummary | null;
  }>;
  reportsByReason: Array<{ reason: string; count: number }>;
  events: Array<Database["public"]["Tables"]["moderation_events"]["Row"] & { actor: ProfileSummary | null }>;
  notes: Array<Database["public"]["Tables"]["moderation_case_notes"]["Row"] & { author: ProfileSummary | null }>;
  appeals: Array<Database["public"]["Tables"]["moderation_appeals"]["Row"]>;
  authorHistory: {
    priorCases: Array<Pick<CaseRow, "id" | "state" | "resolution" | "created_at" | "entity_type">>;
    enforcement: Array<Database["public"]["Tables"]["user_enforcement_actions"]["Row"]>;
  };
  priorRevisionCases: Array<Pick<CaseRow, "id" | "state" | "resolution" | "created_at" | "revision_id">>;
};

export async function getModerationCase(caseId: string, capabilities: CapabilitySet): Promise<CaseDetail | null> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("moderation_cases").select("*").eq("id", caseId).maybeSingle();
  if (!row) return null;

  const [{ data: item }, { data: evidence }, { data: reports }, { data: events }, { data: notes }, { data: appeals }, { data: priorRevisionCases }] =
    await Promise.all([
      admin.from("moderation_items").select("*").eq("id", row.moderation_item_id).maybeSingle(),
      admin.from("moderation_evidence").select("content_snapshot, media_references, captured_at, content_sha256")
        .eq("case_id", row.id).maybeSingle(),
      admin.from("moderation_reports").select("id, reporter_id, reason_code, details, created_at")
        .eq("case_id", row.id).order("created_at", { ascending: true }),
      admin.from("moderation_events").select("*").eq("case_id", row.id).order("created_at", { ascending: true }),
      admin.from("moderation_case_notes").select("*").eq("case_id", row.id).order("created_at", { ascending: true }),
      admin.from("moderation_appeals").select("*").eq("case_id", row.id).order("created_at", { ascending: true }),
      admin.from("moderation_cases").select("id, state, resolution, created_at, revision_id")
        .eq("entity_type", row.entity_type).eq("entity_id", row.entity_id).neq("id", row.id)
        .order("created_at", { ascending: false }),
    ]);

  const contentTable = row.entity_type === "community_post" ? "community_posts" : "community_comments";
  const [{ data: currentContent }, { data: media }, { data: authorCases }, { data: enforcement }] = await Promise.all([
    row.entity_type === "community_post"
      ? admin.from("community_posts").select("content, status, moderation_status, audience").eq("id", row.entity_id).maybeSingle()
      : admin.from(contentTable).select("content, status, moderation_status").eq("id", row.entity_id).maybeSingle(),
    row.entity_type === "community_post"
      ? admin.from("community_post_media").select("id, media_type, moderation_status").eq("post_id", row.entity_id).order("sort_order")
      : Promise.resolve({ data: [] }),
    item?.author_id
      ? admin.from("moderation_cases")
        .select("id, state, resolution, created_at, entity_type, moderation_item_id, moderation_items!inner(author_id)")
        .eq("moderation_items.author_id", item.author_id).neq("id", row.id)
        .order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
    item?.author_id
      ? admin.from("user_enforcement_actions").select("*").eq("profile_id", item.author_id)
        .order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  const canSeeReporters = capabilities.has("reporter_identity_read");
  const profiles = await profilesById([
    item?.author_id,
    row.assigned_moderator_id,
    ...(events ?? []).map((event) => event.actor_id),
    ...(notes ?? []).map((note) => note.author_id),
    ...(canSeeReporters ? (reports ?? []).map((report) => report.reporter_id) : []),
  ]);

  const reasonCounts = new Map<string, number>();
  for (const report of reports ?? []) {
    reasonCounts.set(report.reason_code, (reasonCounts.get(report.reason_code) ?? 0) + 1);
  }
  const now = new Date().toISOString();
  const claimLive = Boolean(row.claim_expires_at && row.claim_expires_at > now);

  return {
    case: row,
    item: item ?? null,
    author: item?.author_id ? profiles.get(item.author_id) ?? null : null,
    assignee: row.assigned_moderator_id ? profiles.get(row.assigned_moderator_id) ?? null : null,
    claimLive,
    evidence: evidence
      ? { snapshot: evidence.content_snapshot, mediaReferences: evidence.media_references, capturedAt: evidence.captured_at, sha256: evidence.content_sha256 }
      : null,
    currentContent: currentContent ?? null,
    media: media ?? [],
    reports: (reports ?? []).map((report) => ({
      id: report.id,
      reason_code: report.reason_code,
      details: report.details,
      created_at: report.created_at,
      // Reporter identity never leaves the server without the capability.
      reporter: canSeeReporters && report.reporter_id ? profiles.get(report.reporter_id) ?? null : null,
    })),
    reportsByReason: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })),
    events: (events ?? []).map((event) => ({ ...event, actor: event.actor_id ? profiles.get(event.actor_id) ?? null : null })),
    notes: (notes ?? []).map((note) => ({ ...note, author: note.author_id ? profiles.get(note.author_id) ?? null : null })),
    appeals: appeals ?? [],
    authorHistory: {
      priorCases: (authorCases ?? []).map((entry) => ({
        id: entry.id, state: entry.state, resolution: entry.resolution, created_at: entry.created_at, entity_type: entry.entity_type,
      })),
      enforcement: enforcement ?? [],
    },
    priorRevisionCases: priorRevisionCases ?? [],
  };
}

export async function getModerationAccessDirectory() {
  const admin = createAdminClient();
  const [{ data: grants }, { data: admins }, { data: events }] = await Promise.all([
    admin.from("moderation_role_grants").select("profile_id, capability, granted_at, granted_by, reason").is("revoked_at", null),
    admin.from("profiles").select("id, display_name, username, is_developer").eq("role", "admin").eq("username_state", "claimed").order("display_name"),
    admin.from("moderation_role_grant_events").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  const byProfile = new Map<string, Array<{ capability: string; granted_at: string; reason: string }>>();
  for (const grant of grants ?? []) {
    const list = byProfile.get(grant.profile_id) ?? [];
    list.push({ capability: grant.capability, granted_at: grant.granted_at, reason: grant.reason });
    byProfile.set(grant.profile_id, list);
  }
  const profiles = await profilesById((events ?? []).flatMap((event) => [event.profile_id, event.actor_id]));
  return {
    admins: (admins ?? []).map((profile) => ({ ...profile, grants: byProfile.get(profile.id) ?? [] })),
    events: (events ?? []).map((event) => ({
      ...event,
      subject: event.profile_id ? profiles.get(event.profile_id) ?? null : null,
      actor: event.actor_id ? profiles.get(event.actor_id) ?? null : null,
    })),
  };
}
