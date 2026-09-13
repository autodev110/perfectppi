// Turns database/trigger failures into member-facing sentences (plan 32.1:
// "proper error messages"). Trigger texts are stable identifiers in our own
// migrations; anything unrecognised gets the caller's fallback while the
// raw message goes to the server log only.

const KNOWN_DATABASE_MESSAGES: Array<[pattern: RegExp, message: string]> = [
  [/private profiles cannot publish public posts/i, "Make your profile public before publishing a Public post."],
  [/active group membership required/i, "Join this group before posting or commenting."],
  [/group unavailable/i, "This group is not available right now."],
  [/group under review/i, "This group is paused while PerfectPPI reviews its ownership."],
  [/group rules acknowledgement required/i, "Review and accept this group's latest rules before posting."],
  [/group posting restricted until/i, "A group moderator has temporarily paused your ability to post in this group."],
  [/group slow mode active; retry after (\d+) seconds/i, "Slow mode is on in this group. Please wait before posting again."],
  [/launch group posts must use the public group audience/i, "Group posts are shared with the whole group."],
  [/content under review or removal cannot be edited/i, "This post is under review and cannot be edited right now."],
  [/accepted answers require a question post/i, "Only questions can have an accepted answer."],
  [/accepted answer must be an active response by another member/i, "Choose a response from another member as the accepted answer."],
  [/post media assembly is incomplete/i, "Some photos have not finished uploading yet. Please try again."],
  [/invalid expected media count/i, "Posts can include between 1 and 10 photos."],
  [/posts can include up to/i, "Posts can include up to 10 photos."],
  [/profile unavailable/i, "Your account is not available for this action right now."],
  [/post unavailable/i, "This post is no longer available."],
  [/can mention up to 10 people/i, "You can mention up to 10 people in a post or comment."],
  [/mention rate limit exceeded/i, "You have mentioned a lot of people in the last hour. Please try again later."],
  [/rate_limited|too quickly/i, "You are doing that too quickly. Please wait a moment and try again."],
  [/violates check constraint|violates foreign key|duplicate key|null value in column/i, "That change could not be saved. Please check the information and try again."],
];

export function friendlyDatabaseError(
  error: { message?: string; code?: string } | null | undefined,
  fallback: string,
  context?: string,
): string {
  const raw = error?.message?.trim() ?? "";
  for (const [pattern, message] of KNOWN_DATABASE_MESSAGES) {
    if (pattern.test(raw)) return message;
  }
  if (raw) {
    console.warn(`[community] ${context ?? "database"} failed`, { code: error?.code, message: raw.slice(0, 300) });
  }
  return fallback;
}
