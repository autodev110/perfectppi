import type { ConversationListingContext } from "@/features/messages/queries";

/**
 * Conversation title formatting, shared by the inbox list and the open thread
 * so both name a conversation the same way. Pure functions only — this module
 * is imported by client components.
 */

type NamedParticipant = {
  id: string;
  display_name: string | null;
  username: string | null;
};

const MAX_NAMES_IN_TITLE = 3;

export function participantDisplayName(participant: NamedParticipant | null | undefined): string {
  if (!participant) return "Unknown";
  if (participant.display_name?.trim()) return participant.display_name.trim();
  if (participant.username?.trim()) return `@${participant.username.trim()}`;
  return participant.id.slice(0, 8);
}

/**
 * Names every person in the thread, counterparty first so the name you scan
 * for leads. Returns "" when the participant list is empty, letting callers
 * decide their own fallback.
 */
export function conversationPeopleLabel(
  participants: NamedParticipant[],
  myProfileId: string | null,
): string {
  const others = participants.filter((p) => p.id !== myProfileId);
  const me = myProfileId ? participants.filter((p) => p.id === myProfileId) : [];
  const ordered = [...others, ...me];

  if (ordered.length === 0) return "";

  const names = ordered.map(participantDisplayName);
  if (names.length <= MAX_NAMES_IN_TITLE) return names.join(" & ");

  const shown = names.slice(0, MAX_NAMES_IN_TITLE - 1);
  return `${shown.join(" & ")} & ${names.length - shown.length} others`;
}

/** The car a marketplace thread is about, e.g. "2019 Toyota Supra". */
export function listingCarLabel(
  listing: ConversationListingContext | null | undefined,
): string | null {
  if (!listing) return null;
  return listing.vehicle_label?.trim() || listing.title?.trim() || null;
}

/**
 * Full conversation title: both people, plus the car when the thread came from
 * a marketplace listing — "Ana Rossi & Ben Cole · 2019 Toyota Supra".
 */
export function conversationTitle(
  participants: NamedParticipant[],
  myProfileId: string | null,
  listing: ConversationListingContext | null | undefined,
): string {
  const people = conversationPeopleLabel(participants, myProfileId) || "Conversation";
  const car = listingCarLabel(listing);
  return car ? `${people} · ${car}` : people;
}
