"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Database } from "@/types/database";

type PostMedia = Pick<
  Database["public"]["Tables"]["community_post_media"]["Row"],
  "id" | "url" | "media_type" | "alt_text"
>;

export function PostMediaCarousel({ media }: { media: PostMedia[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (media.length === 0) return null;

  function go(nextIndex: number) {
    const target = Math.max(0, Math.min(media.length - 1, nextIndex));
    track.current?.children[target]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setIndex(target);
  }

  return (
    <div className="relative border-y border-outline-variant/20 bg-surface-container" role="region" aria-roledescription="carousel" aria-label="Post media">
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth motion-reduce:scroll-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth;
          if (width > 0) setIndex(Math.round(event.currentTarget.scrollLeft / width));
        }}
      >
        {media.map((item, itemIndex) => (
          <div key={item.id} className="relative aspect-square min-w-full snap-center bg-surface-container sm:aspect-[4/3]" role="group" aria-roledescription="slide" aria-label={`${itemIndex + 1} of ${media.length}`}>
            {item.media_type === "video" ? (
              <video
                src={item.url}
                controls
                playsInline
                preload="metadata"
                aria-label={item.alt_text || `Video ${itemIndex + 1}`}
                className="h-full w-full bg-black object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={item.alt_text ?? ""}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            )}
            {media.length > 1 ? (
              <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                {itemIndex + 1}/{media.length}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {media.length > 1 ? (
        <>
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous media" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow outline-none focus-visible:ring-4 focus-visible:ring-white disabled:invisible"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === media.length - 1} aria-label="Next media" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow outline-none focus-visible:ring-4 focus-visible:ring-white disabled:invisible"><ChevronRight className="h-5 w-5" /></button>
          <p className="sr-only" aria-live="polite">Media {index + 1} of {media.length}</p>
        </>
      ) : null}
    </div>
  );
}
