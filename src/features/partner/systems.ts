import type { PartnerSourceSystem } from "./constants";

// ============================================================================
// What differs between partner systems.
//
// The partner contract itself (credentials, signed webhooks, the deliverables
// gate) is shared. Only these facts vary, so they live in one table rather than
// as `source_system === "..."` checks around the codebase.
// ============================================================================

export interface BrowserConnectConfig {
  /** Environment override for the partner's app origin, for non-production use. */
  originEnv: string;
  defaultOrigin: string;
  /** Fixed on our side: a request can never choose where a code is sent. */
  callbackPath: string;
}

export interface PartnerSystem {
  id: PartnerSourceSystem;
  label: string;
  inspectionLabel: string;
  /**
   * Deliver finished reports as soon as all four exist, with no Send button.
   * A report held for review has no artifacts yet, so it is never sent early.
   */
  autoDeliver: boolean;
  /** Set when a manager connects by clicking through from the partner's app. */
  browserConnect: BrowserConnectConfig | null;
}

export const PARTNER_SYSTEMS: Record<PartnerSourceSystem, PartnerSystem> = {
  dealerspace: {
    id: "dealerspace",
    label: "DealerSpace",
    inspectionLabel: "DealerSpace Inspection",
    autoDeliver: false,
    browserConnect: null,
  },
  shopowl: {
    id: "shopowl",
    label: "ShopOwl",
    inspectionLabel: "ShopOwl Inspection",
    autoDeliver: true,
    browserConnect: {
      originEnv: "PARTNER_SHOPOWL_APP_URL",
      defaultOrigin: "https://my.shopowl.io",
      callbackPath: "/api/integrations/perfectppi/callback",
    },
  },
};

export function isPartnerSystem(value: unknown): value is PartnerSourceSystem {
  return typeof value === "string" && Object.hasOwn(PARTNER_SYSTEMS, value);
}

export function partnerSystem(value: unknown): PartnerSystem | null {
  return isPartnerSystem(value) ? PARTNER_SYSTEMS[value] : null;
}

/** The display name for any source value, including a future unknown one. */
export function partnerLabel(value: string | null | undefined): string {
  return partnerSystem(value)?.label ?? value ?? "Partner";
}

export function autoDeliverySystems(): PartnerSourceSystem[] {
  return Object.values(PARTNER_SYSTEMS)
    .filter((system) => system.autoDeliver)
    .map((system) => system.id);
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * The partner's app origin, or null when it is not safely configured. Loopback
 * over HTTP is only ever accepted with the explicit development switch.
 */
export function browserConnectOrigin(system: PartnerSystem): string | null {
  if (!system.browserConnect) return null;
  const raw =
    process.env[system.browserConnect.originEnv]?.trim() ||
    system.browserConnect.defaultOrigin;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    return null;
  }
  if (url.protocol === "https:") return url.origin;
  if (
    url.protocol === "http:" &&
    isLoopback(url.hostname) &&
    process.env.PARTNER_ALLOW_INSECURE_CALLBACKS === "true"
  ) {
    return url.origin;
  }
  return null;
}

/** The one URL a browser-connect code may be sent to. */
export function browserConnectCallback(system: PartnerSystem): string | null {
  const origin = browserConnectOrigin(system);
  if (!origin || !system.browserConnect) return null;
  return new URL(system.browserConnect.callbackPath, origin).href;
}

/** Whether a registered callback belongs to the partner's configured app. */
export function isBrowserConnectDestination(system: PartnerSystem, url: string): boolean {
  const origin = browserConnectOrigin(system);
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}
