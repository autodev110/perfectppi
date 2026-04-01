import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

export function UserAvatar({ src, name, className }: UserAvatarProps) {
  return (
    <Avatar className={cn("h-10 w-10", className)}>
      <AvatarImage src={src ?? undefined} alt={name ?? "User"} />
      <AvatarFallback>{getInitials(name ?? "U")}</AvatarFallback>
    </Avatar>
  );
}
