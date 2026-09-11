// Stable, permission-aware share links (plan 15.4). A share link is the
// canonical page for the thing — never a bearer token — so it re-checks the
// viewer on every open and stops resolving when content is hidden, made
// private, or removed. Client-safe (no server imports).

export type ShareTarget =
  | { kind: "post"; id: string }
  | { kind: "profile"; username: string }
  | { kind: "group"; slug: string }
  | { kind: "vehicle"; id: string };

export function sharePath(target: ShareTarget): string {
  switch (target.kind) {
    case "post":
      return `/community/posts/${encodeURIComponent(target.id)}`;
    case "profile":
      return `/profile/${encodeURIComponent(target.username)}`;
    case "group":
      return `/community/groups/${encodeURIComponent(target.slug)}`;
    case "vehicle":
      return `/vehicle/${encodeURIComponent(target.id)}`;
  }
}

export function shareUrl(target: ShareTarget, origin: string): string {
  return new URL(sharePath(target), origin).toString();
}

/**
 * Text for an external card, built only from fields the anonymous audience
 * may see. Keeps titles short and never echoes identifiers.
 */
export function shareCardTitle(target: ShareTarget, label: string): string {
  switch (target.kind) {
    case "post":
      return `${label} on PerfectPPI Community`;
    case "profile":
      return `${label} · PerfectPPI`;
    case "group":
      return `${label} · PerfectPPI Groups`;
    case "vehicle":
      return `${label} · PerfectPPI`;
  }
}

/** Generic card for anything the anonymous audience may not see. */
export const NEUTRAL_SHARE_CARD = {
  title: "PerfectPPI Community",
  description: "Sign in to PerfectPPI to see this.",
} as const;
