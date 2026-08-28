import { formatVin } from "../../lib/utils/vin.ts";

export const OBD_ANSWER_PROMPTS = {
  vin: "Confirm the VIN on the vehicle",
  warningLights: "Are any warning lights currently on?",
  checkEngine: "Is the check engine light on?",
  activeWarningLights: "List all active warning lights (if any)",
  dtcCodes: "Were DTC codes scanned? List codes if yes.",
} as const;

interface ObdAnswerSnapshot {
  vin?: string | null;
  monitorStatus?: { milOn: boolean } | null;
  storedDTCs?: string[];
  pendingDTCs?: string[];
  permanentDTCs?: string[];
  rawStoredDtcsResponse?: string | null;
  rawPendingDtcsResponse?: string | null;
}

function hasPositiveModeResponse(rawResponse: string | null | undefined, mode: string) {
  const bytes: string[] = rawResponse
    ? Array.from(rawResponse.toUpperCase().match(/[0-9A-F]{2}/g) ?? [])
    : [];
  return bytes.includes(mode);
}

export function buildObdAnswerPrefills(snapshot: ObdAnswerSnapshot) {
  const prefills = new Map<string, string>();
  const vin = snapshot.vin ? formatVin(snapshot.vin) : "";
  if (vin.length === 17) {
    prefills.set(OBD_ANSWER_PROMPTS.vin, vin);
  }

  if (snapshot.monitorStatus) {
    const milOn = snapshot.monitorStatus.milOn;
    prefills.set(OBD_ANSWER_PROMPTS.checkEngine, milOn ? "yes" : "no");

    // Generic OBD-II does not expose every dashboard module, so MIL off does
    // not prove that ABS, airbag, or TPMS lights are also off.
    if (milOn) {
      prefills.set(OBD_ANSWER_PROMPTS.warningLights, "yes");
      prefills.set(OBD_ANSWER_PROMPTS.activeWarningLights, "Check engine light (MIL)");
    }
  }

  const codes = Array.from(
    new Set([
      ...(snapshot.storedDTCs ?? []),
      ...(snapshot.pendingDTCs ?? []),
      ...(snapshot.permanentDTCs ?? []),
    ].map((code) => code.trim().toUpperCase()).filter(Boolean))
  );
  const dtcScanCompleted =
    codes.length > 0 ||
    (hasPositiveModeResponse(snapshot.rawStoredDtcsResponse, "43") &&
      hasPositiveModeResponse(snapshot.rawPendingDtcsResponse, "47"));
  if (dtcScanCompleted) {
    prefills.set(
      OBD_ANSWER_PROMPTS.dtcCodes,
      codes.length > 0
        ? `Scanned - ${codes.join(", ")}`
        : "Scanned - no DTC codes found"
    );
  }

  return prefills;
}
