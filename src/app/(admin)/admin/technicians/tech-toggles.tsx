"use client";

import { useState } from "react";
import { toggleTechnicianFeatured, toggleTechnicianVerified } from "@/features/admin/actions";

interface TechTogglesProps {
  techId: string;
  isFeatured: boolean;
  isVerified: boolean;
}

export function TechToggles({ techId, isFeatured, isVerified }: TechTogglesProps) {
  const [featured, setFeatured] = useState(isFeatured);
  const [verified, setVerified] = useState(isVerified);
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  const [loadingVerified, setLoadingVerified] = useState(false);

  async function handleFeatured() {
    setLoadingFeatured(true);
    const next = !featured;
    const result = await toggleTechnicianFeatured(techId, next);
    if (!result.error) setFeatured(next);
    setLoadingFeatured(false);
  }

  async function handleVerified() {
    setLoadingVerified(true);
    const next = !verified;
    const result = await toggleTechnicianVerified(techId, next);
    if (!result.error) setVerified(next);
    setLoadingVerified(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleVerified}
        disabled={loadingVerified}
        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
          verified
            ? "bg-teal-100 text-teal-700 hover:bg-teal-200"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        {verified ? "Verified ✓" : "Verify"}
      </button>
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
