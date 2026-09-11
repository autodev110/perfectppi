import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type QueryError = { message: string } | null;
type ArrayQuery = PromiseLike<{ data: unknown[] | null; error: QueryError }>;
type SingleQuery = PromiseLike<{ data: unknown | null; error: QueryError }>;

async function rows(label: string, query: ArrayQuery): Promise<unknown[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Could not export ${label}: ${error.message}`);
  return data ?? [];
}

async function row(label: string, query: SingleQuery): Promise<unknown | null> {
  const { data, error } = await query;
  if (error) throw new Error(`Could not export ${label}: ${error.message}`);
  return data;
}

function ids(records: unknown[], key = "id"): string[] {
  return records.flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    const value = (record as Record<string, unknown>)[key];
    return typeof value === "string" ? [value] : [];
  });
}

function mergeById(...groups: unknown[][]): unknown[] {
  const merged = new Map<string, unknown>();
  for (const record of groups.flat()) {
    if (!record || typeof record !== "object") continue;
    const id = (record as Record<string, unknown>).id;
    if (typeof id === "string") merged.set(id, record);
  }
  return [...merged.values()];
}

async function rowsForIds(
  label: string,
  table: keyof Database["public"]["Tables"],
  column: string,
  values: string[],
) {
  if (values.length === 0) return [];
  const admin = createAdminClient();
  const from = admin.from as unknown as (name: string) => {
    select: (columns: string) => { in: (key: string, ids: string[]) => ArrayQuery };
  };
  return rows(label, from(table).select("*").in(column, values));
}

export async function buildAccountDataExport(profileId: string, user: User) {
  const admin = createAdminClient();

  const [
    profile,
    vehicles,
    requestedInspections,
    performedSubmissions,
    communityPosts,
    communityComments,
    authoredMentions,
    receivedMentions,
    sentMessages,
    conversationParticipants,
    mediaPackages,
    technicianProfile,
    writtenReviews,
    notifications,
    deviceTokens,
    legalAcceptances,
    privacyRequests,
    moderationItems,
    moderationReports,
    moderationAppeals,
    enforcementActions,
    partnerUserLinks,
    partnerLinkTransactions,
    auditLogs,
  ] = await Promise.all([
    row("profile", admin.from("profiles").select("*").eq("id", profileId).maybeSingle()),
    rows("vehicles", admin.from("vehicles").select("*").eq("owner_id", profileId)),
    rows(
      "inspection requests",
      admin.from("ppi_requests").select("*")
        .or(`requester_id.eq.${profileId},assigned_tech_id.eq.${profileId}`),
    ),
    rows("performed submissions", admin.from("ppi_submissions").select("*").eq("performer_id", profileId)),
    rows("community posts", admin.from("community_posts").select("*").eq("author_id", profileId)),
    rows("community comments", admin.from("community_comments").select("*").eq("author_id", profileId)),
    rows("authored mentions", admin.from("community_mentions").select("*").eq("author_id", profileId)),
    rows("received mentions", admin.from("community_mentions").select("*").eq("mentioned_profile_id", profileId)),
    rows("sent messages", admin.from("messages").select("*").eq("sender_id", profileId)),
    rows(
      "conversation participation",
      admin.from("conversation_participants").select("*").eq("profile_id", profileId),
    ),
    rows("media packages", admin.from("media_packages").select("*").eq("creator_id", profileId)),
    row("technician profile", admin.from("technician_profiles").select("*").eq("profile_id", profileId).maybeSingle()),
    rows("written technician reviews", admin.from("technician_reviews").select("*").eq("reviewer_id", profileId)),
    rows("notifications", admin.from("notifications").select("*").eq("user_id", profileId)),
    rows(
      "device registrations",
      admin.from("device_tokens")
        .select("id, platform, env, app_version, created_at, last_seen_at")
        .eq("profile_id", profileId),
    ),
    rows("legal acceptances", admin.from("legal_acceptances").select("*").eq("profile_id", profileId)),
    rows(
      "privacy requests",
      admin.from("privacy_requests")
        .select("id, request_type, status, source, details, resolution_summary, submitted_at, acknowledged_at, completed_at, updated_at")
        .eq("profile_id", profileId),
    ),
    rows(
      "moderation items",
      admin.from("moderation_items")
        .select("id, entity_type, entity_id, status, risk_level, decision, reason_codes, content_preview, model_provider, model_name, model_version, created_at, updated_at, decided_at")
        .eq("author_id", profileId),
    ),
    rows("moderation reports", admin.from("moderation_reports").select("*").eq("reporter_id", profileId)),
    rows("moderation appeals", admin.from("moderation_appeals").select("*").eq("appellant_id", profileId)),
    rows("enforcement actions", admin.from("user_enforcement_actions").select("*").eq("profile_id", profileId)),
    rows(
      "partner user links",
      admin.from("partner_user_links")
        .select("id, partner_connection_id, external_user_id, status, linked_at, last_verified_at, revoked_at, created_at, updated_at")
        .eq("profile_id", profileId),
    ),
    rows(
      "partner link transactions",
      admin.from("partner_user_link_transactions")
        .select("id, partner_connection_id, external_user_id, status, expires_at, authorized_at, consumed_at, created_at, updated_at")
        .eq("authorized_profile_id", profileId),
    ),
    rows(
      "audit records",
      admin.from("audit_logs")
        .select("id, action, target_type, target_id, created_at")
        .eq("actor_id", profileId),
    ),
  ]);

  const vehicleIds = ids(vehicles);
  const requestIds = ids(requestedInspections);
  const submissionsForRequests = await rowsForIds(
    "inspection submissions",
    "ppi_submissions",
    "ppi_request_id",
    requestIds,
  );
  const submissions = mergeById(performedSubmissions, submissionsForRequests);
  const submissionIds = ids(submissions);

  const [vehicleMedia, marketplaceListings, sections, obdSnapshots, standardizedOutputs, vscOutputs] = await Promise.all([
    rowsForIds("vehicle media", "vehicle_media", "vehicle_id", vehicleIds),
    rowsForIds("marketplace listings", "marketplace_listings", "vehicle_id", vehicleIds),
    rowsForIds("inspection sections", "ppi_sections", "ppi_submission_id", submissionIds),
    rowsForIds("OBD snapshots", "obd_snapshots", "ppi_submission_id", submissionIds),
    rowsForIds("standardized outputs", "standardized_outputs", "ppi_submission_id", submissionIds),
    rowsForIds("VSC outputs", "vsc_outputs", "ppi_submission_id", submissionIds),
  ]);

  const sectionIds = ids(sections);
  const [answers, inspectionMedia, integrationArtifacts, generationJobs] = await Promise.all([
    rowsForIds("inspection answers", "ppi_answers", "ppi_section_id", sectionIds),
    rowsForIds("inspection media", "ppi_media", "ppi_section_id", sectionIds),
    rowsForIds("integration artifacts", "integration_artifacts", "ppi_submission_id", submissionIds),
    rowsForIds("output generation jobs", "output_generation_jobs", "ppi_submission_id", submissionIds),
  ]);

  const postIds = ids(communityPosts);
  const moderationItemIds = ids(moderationItems);
  const conversationIds = ids(conversationParticipants, "conversation_id");
  const packageIds = ids(mediaPackages);
  const standardizedOutputIds = ids(standardizedOutputs);
  const vscOutputIds = ids(vscOutputs);

  const [
    communityMedia,
    postComments,
    moderationEvents,
    conversationMessages,
    conversations,
    packageShareLinks,
    warrantyOptions,
  ] = await Promise.all([
    rowsForIds("community media", "community_post_media", "post_id", postIds),
    rowsForIds("comments on owned posts", "community_comments", "post_id", postIds),
    rows(
      "moderation events",
      moderationItemIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin.from("moderation_events")
          .select("id, moderation_item_id, event_type, previous_status, next_status, created_at")
          .in("moderation_item_id", moderationItemIds),
    ),
    rowsForIds("conversation messages", "messages", "conversation_id", conversationIds),
    rowsForIds("conversations", "conversations", "id", conversationIds),
    rows(
      "media-package share links",
      packageIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin.from("share_links")
          .select("id, target_type, media_package_id, ppi_submission_id, standardized_output_id, expires_at, created_at")
          .in("media_package_id", packageIds),
    ),
    rowsForIds("warranty options", "warranty_options", "vsc_output_id", vscOutputIds),
  ]);

  const shareLinkColumns = "id, target_type, media_package_id, ppi_submission_id, standardized_output_id, expires_at, created_at";
  const [submissionShareLinks, outputShareLinks] = await Promise.all([
    rows(
      "inspection share links",
      submissionIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin.from("share_links").select(shareLinkColumns).in("ppi_submission_id", submissionIds),
    ),
    rows(
      "report share links",
      standardizedOutputIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin.from("share_links").select(shareLinkColumns).in("standardized_output_id", standardizedOutputIds),
    ),
  ]);
  const shareLinks = mergeById(packageShareLinks, submissionShareLinks, outputShareLinks);

  const technicianProfileIds = technicianProfile && typeof technicianProfile === "object"
    ? ids([technicianProfile])
    : [];
  const warrantyOptionIds = ids(warrantyOptions);
  const [organizationMemberships, receivedReviews, warrantyOrders] = await Promise.all([
    rowsForIds("organization memberships", "organization_memberships", "technician_profile_id", technicianProfileIds),
    rowsForIds("received technician reviews", "technician_reviews", "technician_profile_id", technicianProfileIds),
    rowsForIds("warranty orders", "warranty_orders", "warranty_option_id", warrantyOptionIds),
  ]);
  const contracts = await rowsForIds("contracts", "contracts", "warranty_order_id", ids(warrantyOrders));
  const payments = await rowsForIds("payments", "payments", "contract_id", ids(contracts));

  return {
    format: "perfectppi-account-export",
    version: 1,
    generatedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      identities: (user.identities ?? []).map((identity) => ({
        provider: identity.provider,
        createdAt: identity.created_at,
      })),
    },
    profile,
    vehicles: { records: vehicles, media: vehicleMedia, listings: marketplaceListings },
    inspections: {
      requests: requestedInspections,
      submissions,
      sections,
      answers,
      media: inspectionMedia,
      obdSnapshots,
      standardizedOutputs,
      vscOutputs,
      integrationArtifacts,
      generationJobs,
    },
    community: {
      posts: communityPosts,
      comments: mergeById(communityComments, postComments),
      mentions: {
        authored: authoredMentions,
        received: receivedMentions,
      },
      media: communityMedia,
      moderationItems,
      moderationEvents,
      reports: moderationReports,
      appeals: moderationAppeals,
      enforcementActions,
    },
    communications: {
      conversations,
      participation: conversationParticipants,
      messages: mergeById(sentMessages, conversationMessages),
    },
    technician: {
      profile: technicianProfile,
      organizationMemberships,
      reviewsWritten: writtenReviews,
      reviewsReceived: receivedReviews,
    },
    sharing: { mediaPackages, shareLinks },
    transactions: { warrantyOptions, warrantyOrders, contracts, payments },
    accountOperations: {
      notifications,
      deviceTokens,
      legalAcceptances,
      privacyRequests,
      auditLogs,
      partnerUserLinks,
      partnerLinkTransactions,
    },
  };
}
