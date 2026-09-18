// Plan 15.1 thread projection, shared by every page that renders a post's
// comments. Pure so the node test runner can exercise the placeholder and
// ordering rules without a database.
//
// Rules:
//   * live comments (active + moderation active) pass through;
//   * a top-level comment that is no longer live but still has live replies
//     becomes a neutral placeholder (`removed: true`) so its replies keep
//     their structure — the same wording whether the author removed it or
//     moderation hid it, so a hidden comment leaks nothing extra;
//   * a live reply whose parent is not on the page at all (retention purge
//     nulled the link, or the parent is absent) renders flat as top-level;
//   * oldest first, each parent immediately followed by its replies.

export type ThreadableComment = {
  id: string;
  parent_comment_id: string | null;
  status: string;
  moderation_status: string;
  created_at: string;
};

export function isLiveComment(comment: Pick<ThreadableComment, "status" | "moderation_status">): boolean {
  return comment.status === "active" && comment.moderation_status === "active";
}

export function projectCommentThread<T extends ThreadableComment>(comments: T[]): Array<T & { removed: boolean }> {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const liveReplyParents = new Set(
    comments
      .filter((comment) => isLiveComment(comment) && comment.parent_comment_id && byId.has(comment.parent_comment_id))
      .map((comment) => comment.parent_comment_id as string),
  );
  const kept = comments
    .filter((comment) => isLiveComment(comment) || (comment.parent_comment_id === null && liveReplyParents.has(comment.id)))
    .map((comment) => ({ ...comment, removed: !isLiveComment(comment) }));
  const keptIds = new Set(kept.map((comment) => comment.id));
  const sorted = [...kept].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const topLevel = sorted.filter((comment) => !comment.parent_comment_id || !keptIds.has(comment.parent_comment_id));
  const replies = new Map<string, Array<T & { removed: boolean }>>();
  for (const comment of sorted) {
    if (comment.parent_comment_id && keptIds.has(comment.parent_comment_id)) {
      const list = replies.get(comment.parent_comment_id) ?? [];
      list.push(comment);
      replies.set(comment.parent_comment_id, list);
    }
  }
  return topLevel.flatMap((comment) => [
    { ...comment, parent_comment_id: null },
    ...(replies.get(comment.id) ?? []),
  ]);
}
