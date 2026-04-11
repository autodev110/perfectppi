import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

type MediaPackageRow = Database["public"]["Tables"]["media_packages"]["Row"];
type ShareLinkRow = Database["public"]["Tables"]["share_links"]["Row"];

export interface MediaPackageItem {
  type: "image" | "video" | "file";
  url: string;
  name?: string;
}

export type MediaPackageWithShare = Omit<MediaPackageRow, "items"> & {
  items: MediaPackageItem[];
  share_links?: Pick<ShareLinkRow, "id" | "token" | "expires_at" | "created_at">[];
};

export type ResolvedShareTarget =
  | {
      type: "media_package";
      media_package: MediaPackageWithShare;
    }
  | {
      type: "inspection_result";
      submission: Database["public"]["Tables"]["ppi_submissions"]["Row"];
      request: Pick<
        Database["public"]["Tables"]["ppi_requests"]["Row"],
        "id" | "ppi_type" | "status" | "vehicle_id"
      > | null;
      vehicle: Pick<
        Database["public"]["Tables"]["vehicles"]["Row"],
        "id" | "year" | "make" | "model" | "trim" | "vin" | "mileage"
      > | null;
    }
  | {
      type: "standardized_output";
      standardized_output: Database["public"]["Tables"]["standardized_outputs"]["Row"];
      vehicle: Pick<
        Database["public"]["Tables"]["vehicles"]["Row"],
        "id" | "year" | "make" | "model" | "trim" | "vin"
      > | null;
    };

export interface ResolvedShareLink {
  id: string;
  token: string;
  target_type: ShareLinkRow["target_type"];
  expires_at: string | null;
  created_at: string;
  target: ResolvedShareTarget;
}

async function getAuthProfileId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, profileId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  return { supabase, profileId: profile?.id ?? null };
}

function parseItems(items: Json): MediaPackageItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item): item is Record<string, Json | undefined> => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const record = item as Record<string, Json | undefined>;
      return typeof record.type === "string" && typeof record.url === "string";
    })
    .map((item) => {
      const type: MediaPackageItem["type"] =
        item.type === "video" || item.type === "file" ? item.type : "image";
      const url = item.url as string;
      const name = item.name;

      return {
        type,
        url,
        ...(typeof name === "string" ? { name } : {}),
      };
    });
}

export async function getMyPackages(limit = 100): Promise<MediaPackageWithShare[]> {
  const { supabase, profileId } = await getAuthProfileId();
  if (!profileId) return [];

  const { data: packages } = await supabase
    .from("media_packages")
    .select("*")
    .eq("creator_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const packageIds = (packages ?? []).map((p) => p.id);
  const { data: links } = packageIds.length
    ? await supabase
        .from("share_links")
        .select("id, token, expires_at, created_at, media_package_id")
        .eq("target_type", "media_package")
        .in("media_package_id", packageIds)
        .order("created_at", { ascending: false })
    : { data: [] as { id: string; token: string; expires_at: string | null; created_at: string; media_package_id: string | null }[] };

  const linksByPackage = new Map<string, Pick<ShareLinkRow, "id" | "token" | "expires_at" | "created_at">[]>();
  for (const link of links ?? []) {
    if (!link.media_package_id) continue;
    const arr = linksByPackage.get(link.media_package_id) ?? [];
    arr.push({
      id: link.id,
      token: link.token,
      expires_at: link.expires_at,
      created_at: link.created_at,
    });
    linksByPackage.set(link.media_package_id, arr);
  }

  return (packages ?? []).map((pkg) => ({
    ...pkg,
    items: parseItems(pkg.items),
    share_links: linksByPackage.get(pkg.id) ?? [],
  }));
}

export async function getMediaPackage(id: string): Promise<MediaPackageWithShare | null> {
  const { supabase, profileId } = await getAuthProfileId();
  if (!profileId) return null;

  const { data: pkg } = await supabase
    .from("media_packages")
    .select("*")
    .eq("id", id)
    .eq("creator_id", profileId)
    .maybeSingle();

  if (!pkg) return null;

  const { data: links } = await supabase
    .from("share_links")
    .select("id, token, expires_at, created_at")
    .eq("media_package_id", pkg.id)
    .eq("target_type", "media_package")
    .order("created_at", { ascending: false });

  return {
    ...pkg,
    items: parseItems(pkg.items),
    share_links: links ?? [],
  };
}

export async function resolveShareLink(token: string): Promise<ResolvedShareLink | null> {
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("share_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!link) return null;

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return null;
  }

  if (link.target_type === "media_package" && link.media_package_id) {
    const { data: pkg } = await admin
      .from("media_packages")
      .select("*")
      .eq("id", link.media_package_id)
      .maybeSingle();

    if (!pkg) return null;

    return {
      id: link.id,
      token: link.token,
      target_type: link.target_type,
      expires_at: link.expires_at,
      created_at: link.created_at,
      target: {
        type: "media_package",
        media_package: {
          ...pkg,
          items: parseItems(pkg.items),
        },
      },
    };
  }

  if (link.target_type === "inspection_result" && link.ppi_submission_id) {
    const { data: submission } = await admin
      .from("ppi_submissions")
      .select("*")
      .eq("id", link.ppi_submission_id)
      .maybeSingle();

    if (!submission) return null;

    const { data: request } = await admin
      .from("ppi_requests")
      .select("id, ppi_type, status, vehicle_id")
      .eq("id", submission.ppi_request_id)
      .maybeSingle();

    const { data: vehicle } = request?.vehicle_id
      ? await admin
          .from("vehicles")
          .select("id, year, make, model, trim, vin, mileage")
          .eq("id", request.vehicle_id)
          .maybeSingle()
      : { data: null };

    return {
      id: link.id,
      token: link.token,
      target_type: link.target_type,
      expires_at: link.expires_at,
      created_at: link.created_at,
      target: {
        type: "inspection_result",
        submission,
        request,
        vehicle,
      },
    };
  }

  if (link.target_type === "standardized_output" && link.standardized_output_id) {
    const { data: standardized } = await admin
      .from("standardized_outputs")
      .select("*")
      .eq("id", link.standardized_output_id)
      .maybeSingle();

    if (!standardized) return null;

    const { data: submission } = await admin
      .from("ppi_submissions")
      .select("ppi_request_id")
      .eq("id", standardized.ppi_submission_id)
      .maybeSingle();

    const { data: request } = submission
      ? await admin
          .from("ppi_requests")
          .select("vehicle_id")
          .eq("id", submission.ppi_request_id)
          .maybeSingle()
      : { data: null };

    const { data: vehicle } = request?.vehicle_id
      ? await admin
          .from("vehicles")
          .select("id, year, make, model, trim, vin")
          .eq("id", request.vehicle_id)
          .maybeSingle()
      : { data: null };

    return {
      id: link.id,
      token: link.token,
      target_type: link.target_type,
      expires_at: link.expires_at,
      created_at: link.created_at,
      target: {
        type: "standardized_output",
        standardized_output: standardized,
        vehicle,
      },
    };
  }

  return null;
}
