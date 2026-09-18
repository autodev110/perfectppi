// Plan 22.3: members may choose to share contact details in a conversation,
// with an anti-scam warning shown before they do. Pure and client-safe; the
// same patterns live in the iOS composer. Detection is deliberately loose
// (a phone-shaped run of digits or an email) — it only decides whether the
// caution is shown, never whether the message is allowed.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// A run of digits with phone separators (space, dot, dash, parentheses,
// leading +). Commas and currency signs break a run, so "$67,700, 50,000 mi"
// never reads as a number to call.
const PHONE_RUN = /\+?\(?\d[\d\s().-]{7,}\d/g;

export function containsContactDetails(text: string): boolean {
  if (!text) return false;
  if (EMAIL.test(text)) return true;
  for (const run of text.match(PHONE_RUN) ?? []) {
    const digits = run.replace(/\D/g, "").length;
    if (digits >= 10 && digits <= 15) return true;
  }
  return false;
}

export const CONTACT_SHARING_WARNING =
  "Sharing your phone or email moves this conversation off PerfectPPI. PerfectPPI never asks for payment or a deposit through messages; do not send money to someone you have not met, and keep inspection and sale arrangements in writing.";
