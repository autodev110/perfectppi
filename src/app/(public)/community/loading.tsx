
import { t as uiText } from "@/lib/i18n";
export default function CommunityLoading() {
  return (
    <div className="min-h-screen bg-surface px-8 pb-20 pt-28" aria-label={uiText("ui.loading_community_posts_245d28d196")} aria-busy="true">
      <div className="mx-auto max-w-3xl animate-pulse space-y-5">
        <div className="h-14 w-3/4 rounded-2xl bg-surface-container-high" />
        <div className="h-11 w-72 rounded-2xl bg-surface-container-high" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-[1.75rem] bg-surface-container-lowest p-6 ghost-border">
            <div className="mb-5 flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-surface-container-high" />
              <div className="space-y-2">
                <div className="h-3 w-32 rounded bg-surface-container-high" />
                <div className="h-3 w-20 rounded bg-surface-container-high" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-3 w-full rounded bg-surface-container-high" />
              <div className="h-3 w-5/6 rounded bg-surface-container-high" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
