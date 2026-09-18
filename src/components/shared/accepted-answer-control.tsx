import { CheckCircle2 } from "lucide-react";
import { setAcceptedCommunityAnswer } from "@/features/community/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t as uiText } from "@/lib/i18n";

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
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />{uiText("ui.accepted_answer_205ea1c1e2")}</Badge>
      ) : null}
      {canManage && !ownResponse ? (
        <form action={setAcceptedCommunityAnswer}>
          <input type="hidden" name="post_id" value={postId} />
          <input type="hidden" name="comment_id" value={accepted ? "" : commentId} />
          <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs">
            {accepted ? uiText("ui.clear_accepted_answer_4eb5dda456") : uiText("ui.accept_answer_a81ebe1e2e")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
