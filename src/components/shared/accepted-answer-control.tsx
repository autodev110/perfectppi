import { CheckCircle2 } from "lucide-react";
import { setAcceptedCommunityAnswer } from "@/features/community/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AcceptedAnswerControl({
  postId,
  commentId,
  accepted,
  canManage,
  ownResponse,
}: {
  postId: string;
  commentId: string;
  accepted: boolean;
  canManage: boolean;
  ownResponse: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {accepted ? (
        <Badge className="bg-teal/10 text-teal hover:bg-teal/10">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Accepted answer
        </Badge>
      ) : null}
      {canManage && !ownResponse ? (
        <form action={setAcceptedCommunityAnswer}>
          <input type="hidden" name="post_id" value={postId} />
          <input type="hidden" name="comment_id" value={accepted ? "" : commentId} />
          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs">
            {accepted ? "Clear accepted answer" : "Accept answer"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
