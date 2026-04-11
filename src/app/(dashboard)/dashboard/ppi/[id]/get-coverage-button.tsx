"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateWarrantyOffer } from "@/features/warranty/actions";
import { Button } from "@/components/ui/button";
import { Loader2, Shield } from "lucide-react";

export function GetCoverageButton({ vscOutputId }: { vscOutputId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateWarrantyOffer(vscOutputId);
      if ("error" in result) {
        setError(result.error);
      } else {
        router.push(`/dashboard/warranty/${result.warrantyOptionId}`);
      }
    });
  }

  return (
    <div className="shrink-0">
      <Button
        onClick={handleClick}
        disabled={isPending}
        className="bg-white text-primary-container font-bold hover:bg-white/90 rounded-xl"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Shield className="h-4 w-4 mr-2" />
        )}
        Get Coverage Options
      </Button>
      {error && (
        <p className="text-red-300 text-xs mt-1">{error}</p>
      )}
    </div>
  );
}
