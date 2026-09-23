import { headers } from "next/headers";
import { INSPECTION_CATALOG_HEADER } from "./certification";
import { LEGACY_CATALOG_VERSION, V2_CATALOG_VERSION } from "./inspection-schema";

// ============================================================================
// Client capability gate for typed (catalog 2) inspections.
//
// The web client ships with the server, so browser sessions always support the
// current catalog. Native clients authenticate with a bearer token and must
// declare support explicitly; an older app build that omits the header keeps
// getting the legacy catalog and is told to update instead of receiving answer
// types it cannot decode or submit.
// ============================================================================

async function declaredCatalogSupport(): Promise<number> {
  const headerList = await headers();
  const authorization = headerList.get("authorization") ?? "";
  if (!/^Bearer\s+/i.test(authorization)) return V2_CATALOG_VERSION;
  const declared = Number(headerList.get(INSPECTION_CATALOG_HEADER));
  return Number.isFinite(declared) && declared >= V2_CATALOG_VERSION ? V2_CATALOG_VERSION : LEGACY_CATALOG_VERSION;
}

/** Catalog to seed a new submission with. `PPI_INSPECTION_CATALOG_V2=off` rolls new sessions back to catalog 1. */
export async function seedCatalogVersion(): Promise<1 | 2> {
  if ((process.env.PPI_INSPECTION_CATALOG_V2 ?? "on").toLowerCase() === "off") return LEGACY_CATALOG_VERSION;
  return (await declaredCatalogSupport()) >= V2_CATALOG_VERSION ? V2_CATALOG_VERSION : LEGACY_CATALOG_VERSION;
}

/** Whether the calling client can safely read and edit a submission of this catalog. */
export async function clientSupportsCatalog(catalogVersion: number): Promise<boolean> {
  return catalogVersion <= (await declaredCatalogSupport());
}

export const APP_UPDATE_REQUIRED = {
  error: "Update the PerfectPPI app to open and submit this inspection.",
  code: "app_update_required",
} as const;
