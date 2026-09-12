import Link from "next/link";
import {
  markMarketplaceListingPending,
  markMarketplaceListingSold,
  pauseMarketplaceListing,
  reactivateMarketplaceListing,
  removeMarketplaceListingFromForm,
} from "@/features/marketplace/actions";
import { ConfirmSubmitButton } from "@/components/shared/confirm-submit-button";
import {
  LISTING_ACTION_LABELS,
  LISTING_STATUS_LABELS,
  listingManageActions,
  type ListingManageAction,
  type ListingStatus,
} from "@/lib/marketplace/listing-status";
import { Pencil } from "lucide-react";

const ACTION_FORMS: Record<Exclude<ListingManageAction, "remove">, (formData: FormData) => Promise<void>> = {
  resume: reactivateMarketplaceListing,
  mark_pending: markMarketplaceListingPending,
  pause: pauseMarketplaceListing,
  mark_sold: markMarketplaceListingSold,
};

// Owner controls (plan 25.2): Edit, Mark Pending/Sold, Pause/Resume, Remove.
// Never a "contact yourself" button. Remove is soft while anything still
// references the listing.
export function ListingManagePanel({
  listingId,
  status,
  returnTo,
  error,
}: {
  listingId: string;
  status: ListingStatus;
  returnTo: string;
  error?: string | null;
}) {
  const actions = listingManageActions(status);
  return (
    <div className="rounded-2xl bg-surface-container p-5 ghost-border">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Manage listing</p>
        <span className="rounded-full bg-surface-container-lowest px-3 py-1 text-xs font-bold ghost-border">{LISTING_STATUS_LABELS[status]}</span>
      </div>
      {status === "removed" ? (
        <p className="mt-3 text-sm text-on-surface-variant">This listing was removed. It stays on record for anyone who saved it or requested an inspection; create a new listing to sell this vehicle again.</p>
      ) : (
        <div className="mt-4 grid gap-2">
          <Link href={`/dashboard/listings/${listingId}/edit`} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90">
            <Pencil className="h-4 w-4" />Edit details
          </Link>
          {actions.filter((action): action is Exclude<ListingManageAction, "remove"> => action !== "remove").map((action) => (
            <form key={action} action={ACTION_FORMS[action]}>
              <input type="hidden" name="listing_id" value={listingId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="w-full rounded-xl border border-primary/30 px-5 py-2.5 text-sm font-bold text-primary hover:bg-primary/5">
                {LISTING_ACTION_LABELS[action]}
              </button>
            </form>
          ))}
          {actions.includes("remove") ? (
            <form action={removeMarketplaceListingFromForm}>
              <input type="hidden" name="listing_id" value={listingId} />
              <ConfirmSubmitButton
                message="Remove this listing? Members who saved it or requested an inspection will see it as no longer available. This cannot be undone."
                className="w-full rounded-xl px-5 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/5"
              >
                {LISTING_ACTION_LABELS.remove}
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      )}
      {error ? <p role="alert" className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}
      <p className="mt-3 text-[11px] text-on-surface-variant">
        Pausing hides the listing until you resume it. Marking it pending keeps it visible with a &ldquo;Sale pending&rdquo; badge.
      </p>
    </div>
  );
}
