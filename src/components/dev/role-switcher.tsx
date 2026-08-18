"use client";

import { useState, useTransition } from "react";
import { Check, Code2, Loader2 } from "lucide-react";
import { switchRole } from "@/features/developer/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  SWITCHABLE_ROLES,
  USER_ROLE_DESCRIPTIONS,
  USER_ROLE_LABELS,
  type UserRole,
} from "@/types/enums";

interface RoleSwitcherProps {
  currentRole: UserRole;
  isDeveloper: boolean;
}

/**
 * Rendered on every portal's settings page. It returns null for ordinary
 * accounts, so each host page can drop it in unconditionally.
 */
export function RoleSwitcher({ currentRole, isDeveloper }: RoleSwitcherProps) {
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isDeveloper) return null;

  function handleSwitch(role: UserRole) {
    setError(null);
    setPendingRole(role);

    startTransition(async () => {
      const result = await switchRole(role);

      if (result?.error) {
        setError(result.error);
        setPendingRole(null);
        return;
      }

      // A hard navigation rather than router.push: the role that the server
      // layouts guard on has just changed, and every cached RSC payload in the
      // client router still belongs to the old role.
      window.location.href = result?.redirectTo ?? "/";
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code2 className="h-4 w-4" />
          Developer — Role Switcher
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Switch this account into any role and land in that role&apos;s portal.
          The change is real — permissions, navigation and data are exactly what
          a normal account of that role sees.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {SWITCHABLE_ROLES.map((role) => {
            const isCurrent = role === currentRole;
            const isLoading = isPending && pendingRole === role;

            return (
              <button
                key={role}
                type="button"
                disabled={isPending || isCurrent}
                onClick={() => handleSwitch(role)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                  isCurrent
                    ? "border-transparent bg-slate-900 text-white"
                    : "border-outline-variant/30 hover:bg-slate-100",
                  isPending && !isLoading && "opacity-50",
                  "disabled:cursor-default"
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {USER_ROLE_LABELS[role]}
                  </span>
                  {isCurrent && <Check className="h-4 w-4 shrink-0" />}
                  {isLoading && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    isCurrent ? "text-slate-300" : "text-muted-foreground"
                  )}
                >
                  {USER_ROLE_DESCRIPTIONS[role]}
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          Currently acting as{" "}
          <Badge variant="secondary">{USER_ROLE_LABELS[currentRole]}</Badge>.
          Switching to Technician or Organization Manager provisions the
          supporting records once, then reuses them.
        </p>
      </CardContent>
    </Card>
  );
}
