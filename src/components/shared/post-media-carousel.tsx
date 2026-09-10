"use client";

import type { Database } from "@/types/database";

type PostMedia = Pick<
  Database["public"]["Tables"]["community_post_media"]["Row"],
  "id" | "url" | "media_type"
>;

export function PostMediaCarousel({ media }: { media: PostMedia[] }) {
  if (media.length === 0) return null;

  return (
    <div className="relative border-y border-outline-variant/20 bg-black">
      <div className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {media.map((item, index) => (
          <div key={item.id} className="relative aspect-square min-w-full snap-center sm:aspect-[4/3]">
            {item.media_type === "video" ? (
              <video
                src={item.url}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt={`Post media ${index + 1}`} className="h-full w-full object-contain" />
            )}
            {media.length > 1 ? (
              <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                {index + 1}/{media.length}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {media.length > 1 ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
          Swipe for more
        </p>
      ) : null}
    </div>
  );
}
