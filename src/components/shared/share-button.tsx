"use client";

// TODO Phase E: Share link generation + copy-to-clipboard

interface ShareButtonProps {
  targetType: "media_package" | "inspection_result" | "standardized_output";
  targetId: string;
}

export function ShareButton({ targetType, targetId }: ShareButtonProps) {
  // Phase E implementation
  void targetType;
  void targetId;
  return null;
}
