// Invite attribution (Renditions KPIs). The cookie only says "arrived via a
// shared invite link"; it never carries who shared it.
export const INVITE_COOKIE = "ppi_invite";
export const INVITE_QUERY_PARAM = "via";
export const INVITE_QUERY_VALUE = "invite";

/** The signup URL shared from Friends → Invite (web and iOS). */
export function inviteSignupPath(): string {
  return `/signup?${INVITE_QUERY_PARAM}=${INVITE_QUERY_VALUE}`;
}
