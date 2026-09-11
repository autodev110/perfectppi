// Pure mapping from a stored notification to the destination it *intends*
// to open (plan 22.1: each item deep-links to a permission-checked
// destination). Permission checks live in features/notifications/destinations;
// this module only reads the type and data payload, so it is unit-testable.

export type NotificationDestinationKind =
  | "post"
  | "group"
  | "profile"
  | "friends"
  | "conversation"
  | "inspection_request"
  | "listing_vehicle"
  | "my_posts"
  | "moderation_case"
  | "organization"
  | "none";

export type NotificationDestinationIntent = {
  kind: NotificationDestinationKind;
  /** Primary identifier for the kind (post id, username, conversation id, …). */
  id: string | null;
  /** Secondary identifier where useful (message id, comment id, …). */
  secondaryId: string | null;
};

export const NOTIFICATION_CATEGORIES = ["social", "groups", "messages", "marketplace", "inspections", "safety", "account"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, { label: string; description: string; locked: boolean }> = {
  social: { label: "Community", description: "Friend requests, comments, likes, and accepted answers.", locked: false },
  groups: { label: "Groups", description: "Moderator actions on your group posts and role changes.", locked: false },
  messages: { label: "Messages", description: "New direct messages.", locked: false },
  marketplace: { label: "Marketplace", description: "Inquiries and inspection requests on your listings, and changes to listings you saved.", locked: false },
  inspections: { label: "Inspections", description: "Technician assignments and report updates.", locked: false },
  safety: { label: "Safety & moderation", description: "Report receipts, decisions, warnings, and restrictions. Always delivered.", locked: true },
  account: { label: "Account", description: "Payments, security, and privacy requests. Always delivered.", locked: true },
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function notificationDestinationIntent(
  type: string,
  data: Record<string, unknown> | null | undefined,
): NotificationDestinationIntent {
  const d = data ?? {};
  switch (type) {
    case "post_comment":
    case "post_likes":
    case "answer_accepted":
    case "accepted_answer_unavailable":
      return { kind: "post", id: str(d.post_id), secondaryId: str(d.comment_id) };
    case "friend_request":
      return { kind: "friends", id: null, secondaryId: null };
    case "friend_request_accepted":
      return str(d.username)
        ? { kind: "profile", id: str(d.username), secondaryId: null }
        : { kind: "friends", id: null, secondaryId: null };
    case "message_received":
      return { kind: "conversation", id: str(d.conversation_id), secondaryId: str(d.message_id) };
    case "listing_inspection_requested":
    case "saved_listing_updated":
      return { kind: "listing_vehicle", id: str(d.vehicle_id), secondaryId: str(d.listing_id) };
    case "moderation_decision":
    case "group_post_removed":
      // A removed group post is only reachable from the author's own list.
      return { kind: "my_posts", id: null, secondaryId: null };
    case "group_role_changed":
      return { kind: "group", id: str(d.group_slug), secondaryId: str(d.group_id) };
    case "moderation_case":
      return { kind: "moderation_case", id: str(d.caseId), secondaryId: null };
    case "tech_request_new":
    case "tech_request_accepted":
    case "inspection_submitted":
    case "inspection_updated":
      return str(d.request_id)
        ? { kind: "inspection_request", id: str(d.request_id), secondaryId: null }
        : str(d.org_id)
          ? { kind: "organization", id: str(d.org_id), secondaryId: null }
          : { kind: "none", id: null, secondaryId: null };
    default:
      return { kind: "none", id: null, secondaryId: null };
  }
}

/** Web path for a resolved destination; null when nothing to open. */
export function notificationWebPath(intent: NotificationDestinationIntent, messagesBase = "/dashboard/messages"): string | null {
  switch (intent.kind) {
    case "post":
      return intent.id ? `/community#post-${intent.id}` : "/community";
    case "group":
      return intent.id ? `/community/groups/${encodeURIComponent(intent.id)}` : "/community/groups";
    case "profile":
      return intent.id ? `/profile/${encodeURIComponent(intent.id)}` : "/dashboard/friends";
    case "friends":
      return "/dashboard/friends";
    case "conversation":
      if (!intent.id) return messagesBase;
      return intent.secondaryId
        ? `${messagesBase}/${intent.id}?m=${encodeURIComponent(intent.secondaryId)}`
        : `${messagesBase}/${intent.id}`;
    case "inspection_request":
      return intent.id ? `/dashboard/ppi/${intent.id}` : "/dashboard/ppi";
    case "listing_vehicle":
      return intent.id ? `/vehicle/${intent.id}?tab=marketplace` : "/dashboard/listings";
    case "my_posts":
      return "/dashboard/posts?tab=review";
    case "moderation_case":
      return intent.id ? `/admin/moderation/cases/${intent.id}` : "/admin/moderation";
    case "organization":
      return "/tech/organization";
    case "none":
      return null;
  }
}
