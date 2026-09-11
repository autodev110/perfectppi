import Link from "next/link";
import type { CommunityMention } from "@/features/community/queries";

type Props = {
  content: string;
  mentions?: CommunityMention[] | null;
  className?: string;
};

export function CommunityMentionText({ content, mentions, className }: Props) {
  const destinations = new Map(
    (mentions ?? []).flatMap((mention) => mention.profile?.username
      ? [[mention.rendered_username.toLowerCase(), mention.profile.username] as const]
      : []),
  );
  const nodes: React.ReactNode[] = [];
  const expression = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{4,16})(?![A-Za-z0-9_])/g;
  let cursor = 0;

  for (const match of content.matchAll(expression)) {
    const prefix = match[1];
    const renderedUsername = match[2];
    const matchStart = match.index;
    const mentionStart = matchStart + prefix.length;
    const mentionEnd = mentionStart + renderedUsername.length + 1;
    const username = destinations.get(renderedUsername.toLowerCase());

    nodes.push(content.slice(cursor, mentionStart));
    nodes.push(username ? (
      <Link
        key={`${mentionStart}-${renderedUsername}`}
        href={`/profile/${encodeURIComponent(username)}`}
        className="font-semibold text-primary hover:underline"
      >
        {content.slice(mentionStart, mentionEnd)}
      </Link>
    ) : content.slice(mentionStart, mentionEnd));
    cursor = mentionEnd;
  }
  nodes.push(content.slice(cursor));

  return (
    <span className={className}>{nodes}</span>
  );
}
