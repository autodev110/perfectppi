import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type UploadEntity =
  | "ppi_media"
  | "vehicle_media"
  | "media_package"
  | "community_post"
  | "message_attachment";

export async function canUploadToTarget(
  supabase: SupabaseClient<Database>,
  profileId: string,
  entity: UploadEntity,
  recordId: string
): Promise<boolean> {
  switch (entity) {
    case "ppi_media": {
      const { data } = await supabase
        .from("ppi_submissions")
        .select("id")
        .eq("id", recordId)
        .eq("performer_id", profileId)
        .maybeSingle();
      return Boolean(data);
    }
    case "vehicle_media": {
      const { data } = await supabase
        .from("vehicles")
        .select("id")
        .eq("id", recordId)
        .eq("owner_id", profileId)
        .maybeSingle();
      return Boolean(data);
    }
    case "media_package": {
      const { data } = await supabase
        .from("media_packages")
        .select("id")
        .eq("id", recordId)
        .eq("creator_id", profileId)
        .maybeSingle();
      return Boolean(data);
    }
    case "community_post": {
      const { data } = await supabase
        .from("community_posts")
        .select("id")
        .eq("id", recordId)
        .eq("author_id", profileId)
        .maybeSingle();
      return Boolean(data);
    }
    case "message_attachment": {
      const { data } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", recordId)
        .eq("profile_id", profileId)
        .maybeSingle();
      return Boolean(data);
    }
  }
}
