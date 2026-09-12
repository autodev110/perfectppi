// Listing lifecycle (plan 25.2). Client-safe and pure; the database enforces
// the same rules in set_marketplace_listing_status / remove_marketplace_listing.

export const LISTING_STATUSES = ["active", "pending", "paused", "sold", "archived", "removed"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  active: "Active",
  pending: "Sale pending",
  paused: "Paused",
  sold: "Sold",
  archived: "Archived",
  removed: "Removed",
};

/** Visible to buyers (browse, search, detail). */
export function isListingPublic(status: ListingStatus): boolean {
  return status === "active" || status === "pending";
}

export type ListingManageAction = "resume" | "mark_pending" | "pause" | "mark_sold" | "remove";

export const LISTING_ACTION_LABELS: Record<ListingManageAction, string> = {
  resume: "Resume listing",
  mark_pending: "Mark sale pending",
  pause: "Pause",
  mark_sold: "Mark sold",
  remove: "Remove listing",
};

/** Target status for each action; remove is its own call. */
export const LISTING_ACTION_STATUS: Record<Exclude<ListingManageAction, "remove">, ListingStatus> = {
  resume: "active",
  mark_pending: "pending",
  pause: "paused",
  mark_sold: "sold",
};

/** Actions the owner may take from a status, in menu order. */
export function listingManageActions(status: ListingStatus): ListingManageAction[] {
  switch (status) {
    case "active":
      return ["mark_pending", "pause", "mark_sold", "remove"];
    case "pending":
      return ["resume", "pause", "mark_sold", "remove"];
    case "paused":
    case "archived":
      return ["resume", "mark_sold", "remove"];
    case "sold":
      return ["resume", "remove"];
    case "removed":
      return [];
  }
}

/** Explains the friendly meaning of an error code from the lifecycle RPCs. */
export function listingLifecycleMessage(code: string | null | undefined): string {
  switch (code) {
    case "listing_removed":
      return "This listing was removed and can't be changed. Create a new listing to sell this vehicle again.";
    case "listing_sold":
      return "A sold listing can only be relisted or removed.";
    case "listing_vehicle_not_owned":
      return "Only the vehicle's current owner can relist it.";
    case "listing_vehicle_already_listed":
      return "This vehicle already has a live listing. Remove or sell that one first.";
    case "listing_not_found":
      return "Listing not found.";
    default:
      return "The listing could not be updated. Please try again.";
  }
}
