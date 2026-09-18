import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BellOff } from "lucide-react";
import { t as uiText } from "@/lib/i18n";

// Neutral landing for a notification whose destination is gone, hidden,
// private, or blocked (plan 22.1). Deliberately does not say which.
export default function NotificationUnavailablePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <BellOff className="h-10 w-10 text-muted-foreground/40" />
      <h1 className="font-heading text-xl font-extrabold">{uiText("ui.this_content_is_no_longer_available_cd53290c39")}</h1>
      <p className="text-sm text-muted-foreground">{uiText("ui.it_may_have_been_removed_made_private_or_is__7fca40103e")}</p>
      <div className="flex gap-2">
        <Button asChild><Link href="/community">{uiText("ui.go_to_community_244e8e956c")}</Link></Button>
        <Button asChild variant="outline"><Link href="/dashboard">{uiText("ui.dashboard_67b6964686")}</Link></Button>
      </div>
    </div>
  );
}
