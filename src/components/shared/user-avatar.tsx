import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";
import { t as uiText } from "@/lib/i18n";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

export function UserAvatar({ src, name, className }: UserAvatarProps) {
  return (
    <Avatar className={cn("h-10 w-10", className)}>
      <AvatarImage src={src ?? undefined} alt={name ?? uiText("ui.user_b512d97e7c")} />
      <AvatarFallback>{getInitials(name ?? uiText("ui.u_a25513c7e0"))}</AvatarFallback>
    </Avatar>
  );
}
