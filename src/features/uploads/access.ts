import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type UploadEntity = "ppi_media" | "vehicle_media" | "media_package";

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
  }
}
