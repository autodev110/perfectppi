import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BellOff } from "lucide-react";

// Neutral landing for a notification whose destination is gone, hidden,
// private, or blocked (plan 22.1). Deliberately does not say which.
export default function NotificationUnavailablePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <BellOff className="h-10 w-10 text-muted-foreground/40" />
      <h1 className="font-heading text-xl font-extrabold">This content is no longer available</h1>
      <p className="text-sm text-muted-foreground">
        It may have been removed, made private, or is not accessible to your account.
      </p>
      <div className="flex gap-2">
        <Button asChild><Link href="/community">Go to Community</Link></Button>
        <Button asChild variant="outline"><Link href="/dashboard">Dashboard</Link></Button>
      </div>
    </div>
  );
}
