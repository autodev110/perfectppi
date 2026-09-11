import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";

export type UploadEntity =
  | "ppi_media"
  | "vehicle_media"
  | "media_package"
  | "community_post"
  | "community_group"
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
      // Packages upload before their row is created. The private object key is
      // owner-scoped and createMediaPackage verifies the same staging id.
      return true;
    }
    case "community_post": {
      // Community raw reads are revoked from authenticated clients. Upload
      // routes already authenticate the caller, then this server-only query
      // proves ownership for both published posts and hidden assemblies.
      const { data } = await createAdminClient()
        .from("community_posts")
        .select("id")
        .eq("id", recordId)
        .eq("author_id", profileId)
        .maybeSingle();
      return Boolean(data);
    }
    case "community_group": {
      // Group avatar / cover (plan 13.5): the owner or an admin of a live group.
      const admin = createAdminClient();
      const { data: group } = await admin
        .from("community_groups")
        .select("id")
        .eq("id", recordId)
        .eq("status", "active")
        .maybeSingle();
      if (!group) return false;
      const { data: role } = await admin.rpc("community_group_role_of", { p_profile_id: profileId, p_group_id: recordId });
      return role === "owner" || role === "admin";
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
