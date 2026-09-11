import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getOptionalProfile } from "@/features/auth/guards";
import { getCommunityPostById } from "@/features/community/queries";
import { getPostSharePreview, postShareCard } from "@/features/share/previews";
import { CommunityPostArticle } from "@/components/shared/community-post-article";
import { ShareButton } from "@/components/shared/share-button";
import { sharePath } from "@/lib/share/links";
import { ArrowLeft, Lock, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Share cards see only what the anonymous audience may see (plan 15.4).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const card = UUID.test(id)
    ? await postShareCard(id)
    : { title: "PerfectPPI Community", description: "Sign in to PerfectPPI to see this.", path: "/community", available: false };
  return {
    title: card.title,
    description: card.description,
    openGraph: { title: card.title, description: card.description, url: card.path, type: "article" },
    twitter: { card: "summary", title: card.title, description: card.description },
    robots: card.available ? undefined : { index: false },
  };
}

// The stable share link for a post. Signed in: the full post, re-checked
// against the viewer's visibility. Signed out: a public preview and a
// sign-in prompt, or a neutral "not available" that looks the same for
// hidden, private, and nonexistent posts.
export default async function CommunityPostPage({ params }: PageProps) {
  const { id } = await params;
  const valid = UUID.test(id);
  const viewer = await getOptionalProfile(["consumer", "technician", "org_manager", "admin"]);
  const post = viewer && valid ? await getCommunityPostById(id) : null;
  const preview = !viewer && valid ? await getPostSharePreview(id) : null;

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community"><ArrowLeft className="mr-2 h-4 w-4" />Community</Link></Button>
        {post ? (
          <div className="space-y-4">
            <CommunityPostArticle post={post} viewerId={viewer!.id} linkToPost={false} />
          </div>
        ) : preview ? (
          <section className="rounded-[1.5rem] bg-surface-container-lowest p-8 shadow-sm ghost-border">
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{preview.post_type === "question" ? "Question" : "Post"} by {preview.author_label}</p>
            <p className="mt-3 whitespace-pre-wrap text-lg leading-relaxed text-on-surface">{preview.excerpt}{preview.excerpt.length >= 160 ? "…" : ""}</p>
            <p className="mt-3 text-sm text-on-surface-variant">
              {[preview.vehicle_label ? `About a ${preview.vehicle_label}` : null,
                preview.media_count > 0 ? `${preview.media_count} photo${preview.media_count === 1 ? "" : "s"}` : null]
                .filter(Boolean).join(" · ")}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild><Link href={`/login?redirect=${encodeURIComponent(sharePath({ kind: "post", id }))}`}>Sign in to see the full post</Link></Button>
              <Button asChild variant="outline"><Link href="/signup">Join PerfectPPI</Link></Button>
              <ShareButton path={sharePath({ kind: "post", id })} title={`${preview.author_label} on PerfectPPI Community`} />
            </div>
          </section>
        ) : (
          <section className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border">
            {viewer ? <MessageSquare className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" /> : <Lock className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" />}
            <p className="font-semibold">This post isn&rsquo;t available.</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {viewer
                ? "It may have been removed, made private, or shared with a group you are not in."
                : "It may be private, shared with friends or a group, or no longer exist. Sign in if you were sent this link by a friend."}
            </p>
            {!viewer ? (
              <Button asChild className="mt-5"><Link href={`/login?redirect=${encodeURIComponent(sharePath({ kind: "post", id }))}`}>Sign in</Link></Button>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
