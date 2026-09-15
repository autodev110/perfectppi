"use client";

import { useEffect, useRef, useState } from "react";
import { Car, ChevronLeft, ChevronRight } from "lucide-react";
import { ExtendedReportControl } from "@/components/shared/extended-report-control";

// Swipeable full-width gallery with a count (plan 25.2 §1). Scroll-snap does
// the swiping; the buttons and count follow the scroll position.
export function ListingGallery({ photos, alt, canReport = false }: { photos: Array<{ id: string; url: string }>; alt: string; canReport?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const visiblePhotos = photos.filter((photo) => !hiddenIds.has(photo.id));

  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const onScroll = () => setIndex(Math.round(node.scrollLeft / Math.max(node.clientWidth, 1)));
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  function go(delta: number) {
    const node = track.current;
    if (!node) return;
    const next = Math.min(Math.max(index + delta, 0), visiblePhotos.length - 1);
    node.scrollTo({ left: next * node.clientWidth, behavior: "smooth" });
  }

  if (visiblePhotos.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[1.5rem] bg-surface-container-low ghost-border sm:aspect-[16/9]">
        <div className="text-center text-on-surface-variant/50">
          <Car className="mx-auto h-14 w-14" />
          <p className="mt-2 text-xs font-semibold">No photos yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-surface-container-low ghost-border">
      <div ref={track} className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-roledescription="carousel" aria-label={`${alt} photos`}>
        {visiblePhotos.map((photo, i) => (
          <div key={photo.id} className="aspect-[4/3] w-full shrink-0 snap-center sm:aspect-[16/9]" aria-roledescription="slide" aria-label={`Photo ${i + 1} of ${visiblePhotos.length}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={i === 0 ? alt : ""} className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} draggable={false} />
          </div>
        ))}
      </div>
      {visiblePhotos.length > 1 ? (
        <>
          <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-on-surface shadow disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => go(1)} disabled={index >= visiblePhotos.length - 1} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-on-surface shadow disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      ) : null}
      {canReport && visiblePhotos[index] ? (
        <div className="absolute right-3 top-3 rounded-lg bg-white/95 shadow">
          <ExtendedReportControl
            entityType="media"
            entityId={visiblePhotos[index].id}
            label="Photo"
            onReported={() => {
              const id = visiblePhotos[index].id;
              setHiddenIds((current) => new Set(current).add(id));
              setIndex((current) => Math.max(0, Math.min(current, visiblePhotos.length - 2)));
            }}
          />
        </div>
      ) : null}
      <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white" aria-live="polite">
        {Math.min(index + 1, visiblePhotos.length)} / {visiblePhotos.length}
      </span>
    </div>
  );
}
