"use client";

import { useState } from "react";
import { toggleTechnicianFeatured } from "@/features/admin/actions";

interface TechTogglesProps {
  techId: string;
  isFeatured: boolean;
}

export function TechToggles({ techId, isFeatured }: TechTogglesProps) {
  const [featured, setFeatured] = useState(isFeatured);
  const [loadingFeatured, setLoadingFeatured] = useState(false);

  async function handleFeatured() {
    setLoadingFeatured(true);
    const next = !featured;
    const result = await toggleTechnicianFeatured(techId, next);
    if (!result.error) setFeatured(next);
    setLoadingFeatured(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleFeatured}
        disabled={loadingFeatured}
        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
          featured
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        {featured ? "Featured ★" : "Feature"}
      </button>
    </div>
  );
}
