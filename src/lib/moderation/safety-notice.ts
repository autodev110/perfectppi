// Safety notice for high-consequence repair topics (plan section 15.5).
//
// Posts that discuss brakes, airbags, vehicle lifting, fuel systems, or
// high-voltage EV systems carry a server-computed notice reminding readers
// that Community answers are not a professional diagnosis. This is a label,
// not a moderation decision: matching never blocks, hides, or reports a post,
// and a miss is acceptable. Patterns are deliberately phrase-level so that
// casual mentions ("fuel economy", a member named Jack) do not trigger it.
//
// The notice text is server-owned so the wording can change without an app
// release; clients render `message` verbatim and may use `topics` for icons.
// Copy comes from the message catalog (plan 32.2). Relative import so the
// node test runner can load this module without path aliases.
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";

export const SAFETY_TOPIC_CODES = ["brakes", "airbags", "lifting", "fuel_system", "high_voltage"] as const;

export type SafetyTopicCode = (typeof SAFETY_TOPIC_CODES)[number];

export type SafetyNotice = {
  topics: SafetyTopicCode[];
  message: string;
};

export function safetyTopicLabel(topic: SafetyTopicCode, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, `safety.topic.${topic}` as MessageKey);
}

/** Default-locale labels for existing callers. */
export const SAFETY_TOPIC_LABELS: Record<SafetyTopicCode, string> = Object.fromEntries(
  SAFETY_TOPIC_CODES.map((topic) => [topic, safetyTopicLabel(topic)]),
) as Record<SafetyTopicCode, string>;

const SAFETY_TOPIC_PATTERNS: Record<SafetyTopicCode, RegExp[]> = {
  brakes: [
    /\bbrakes?\b(?![- ]lights?)/i,
    /\bhand ?brake\b/i,
    /\bbraking\b/i,
    /\bbrake[- ](pads?|rotors?|discs?|lines?|fluid|caliper|calipers|booster|hoses?|drums?)\b/i,
    /\bcalipers?\b/i,
    /\bmaster cylinder\b/i,
    /\babs\b(?![-.]?\d)/i,
    /\banti[- ]lock\b/i,
  ],
  airbags: [
    /\bair ?bags?\b/i,
    /\bsrs\b/i,
    /\bsupplemental restraint\b/i,
    /\bseat ?belt pretensioners?\b/i,
    /\bclock ?spring\b/i,
  ],
  lifting: [
    /\bjack stands?\b/i,
    /\bjack(ing)? points?\b/i,
    /\bfloor jack\b/i,
    /\bscissor jack\b/i,
    /\bjack(ed|ing)? (it |the (car|truck|vehicle|suv) )?up\b/i,
    /\b(car|vehicle|truck|two[- ]post|2[- ]post|four[- ]post|4[- ]post|scissor|quick) lifts?\b/i,
    /\blift(ed|ing)? the (car|truck|vehicle|suv)\b/i,
    /\bunder(neath)? the (car|truck|vehicle|suv)\b/i,
    /\b(car|wheel|drive[- ]on) ramps\b/i,
  ],
  fuel_system: [
    /\bfuel (pumps?|lines?|tanks?|rails?|injectors?|leaks?|leaking|pressure|filters?|systems?|smell|vapou?r|hoses?)\b/i,
    /\b(gas|gasoline|petrol|diesel) (leaks?|leaking|tanks?|lines?|smell|fumes|vapou?r)\b/i,
    /\bsmell(s|ing|ed)? (of |like )?(gas|gasoline|fuel|petrol|diesel)\b/i,
    /\bfuel[- ]injection\b/i,
    /\bhigh[- ]pressure fuel\b/i,
  ],
  high_voltage: [
    /\bhigh[- ]voltage\b/i,
    /\bhv (battery|batteries|cables?|systems?|packs?|wiring|connectors?|disconnect)\b/i,
    /\borange (cables?|wiring|connectors?)\b/i,
    /\btraction batter(y|ies)\b/i,
    /\b(ev|hybrid|lithium|li[- ]ion) (battery|batteries|pack|packs)\b/i,
    /\bbattery pack\b/i,
    /\binverters?\b/i,
    /\b(400|800)[- ]?v(olts?)?\b/i,
    /\bservice (plug|disconnect)\b/i,
  ],
};

export function detectSafetyTopics(text: string | null | undefined): SafetyTopicCode[] {
  if (!text) return [];
  return SAFETY_TOPIC_CODES.filter((topic) =>
    SAFETY_TOPIC_PATTERNS[topic].some((pattern) => pattern.test(text)),
  );
}

function joinTopics(labels: string[], locale: Locale) {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return translate(locale, "list.two", { first: labels[0], second: labels[1] });
  return labels.slice(0, -1).join(translate(locale, "list.many_separator"))
    + translate(locale, "list.many_last", { last: labels[labels.length - 1] });
}

export function buildSafetyNotice(text: string | null | undefined, locale: Locale = DEFAULT_LOCALE): SafetyNotice | null {
  const topics = detectSafetyTopics(text);
  if (topics.length === 0) return null;
  const subject = joinTopics(topics.map((topic) => safetyTopicLabel(topic, locale)), locale);
  return {
    topics,
    message: translate(locale, "safety.notice", { subject }),
  };
}
