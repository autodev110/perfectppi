import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { SafetyNotice as SafetyNoticeModel } from "@/lib/moderation/safety-notice";
import { t as uiText } from "@/lib/i18n";

// Plan 15.5: server-computed label for high-consequence repair topics. The
// message is rendered verbatim so wording changes ship without a client
// release; the topics only drive the accessible summary.
export function SafetyNotice({ notice, compact = false }: { notice: SafetyNoticeModel | null; compact?: boolean }) {
  if (!notice) return null;
  return (
    <aside
      role="note"
      aria-label={uiText("ui.safety_notice_20c7a68cfc", { arg0: String(notice.topics.join(", ").replace(/_/g, " ")) })}
      className={`flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 ${compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"}`}
    >
      <ShieldAlert className={`${compact ? "mt-0.5 h-3.5 w-3.5" : "mt-0.5 h-4 w-4"} shrink-0`} aria-hidden="true" />
      <p className="leading-relaxed">
        {notice.message}{" "}
        <Link href="/community-guidelines#vehicle-safety" className="font-semibold underline underline-offset-2">{uiText("ui.read_the_safety_rules_a6a0536e0b")}</Link>
      </p>
    </aside>
  );
}
