"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FriendActionButton } from "@/components/shared/friend-action-button";
import { inviteSignupPath } from "@/lib/analytics/invite";

import { useTranslator } from "@/lib/i18n/client";

type PickedContact = { name?: string[]; email?: string[]; tel?: string[] };
type ContactNavigator = Navigator & {
  contacts?: { select: (properties: string[], options: { multiple: boolean }) => Promise<PickedContact[]> };
};
type Match = {
  id: string;
  username: string | null;
  display_name: string | null;
  relationship_state: "self" | "blocked" | "friends" | "outgoing_request" | "incoming_request" | "none";
  mutual_friend_count: number;
  contact_hash: string;
};

const inviteUrl = `https://www.perfectppi.com${inviteSignupPath()}`;

export function ContactDiscoveryPanel() {
  const uiText = useTranslator();
  const [matches, setMatches] = useState<Match[]>([]);
  const [inviteNames, setInviteNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function chooseContacts() {
    const contactApi = (navigator as ContactNavigator).contacts;
    if (!contactApi?.select || !window.isSecureContext) {
      await shareInvite();
      setMessage(uiText("ui.contact_matching_is_not_supported_by_this_br_79e4fd2c2f"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const contacts = await contactApi.select(["name", "email", "tel"], { multiple: true });
      const withHashes = await Promise.all(contacts.map(async (contact) => ({
        name: contact.name?.[0]?.trim() || "Contact",
        hashes: await Promise.all([
          ...(contact.email ?? []).map((value) => value.trim().toLocaleLowerCase()),
          ...(contact.tel ?? []).flatMap(phoneVariants),
        ].filter(Boolean).map(digest)),
      })));
      const hashes = [...new Set(withHashes.flatMap((contact) => contact.hashes))];
      if (!hashes.length) {
        setMessage(uiText("ui.the_selected_contacts_do_not_include_an_emai_699dd47dd2"));
        return;
      }
      // 500 hashes per request; a large selection is checked in batches.
      const found: Match[] = [];
      for (let start = 0; start < hashes.length && start < 4000; start += 500) {
        const response = await fetch("/api/social/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hashes: hashes.slice(start, start + 500) }),
        });
        const payload = await response.json() as { data?: Match[]; error?: string };
        if (!response.ok) throw new Error(payload.error || uiText("ui.contact_suggestions_are_unavailable_3bcccb1007"));
        found.push(...(payload.data ?? []));
      }
      const matchedHashes = new Set(found.map((match) => match.contact_hash));
      setMatches(found.filter((match, index, all) => all.findIndex((other) => other.id === match.id) === index));
      setInviteNames(withHashes.filter((contact) => contact.hashes.every((hash) => !matchedHashes.has(hash))).map((contact) => contact.name));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiText("ui.contacts_could_not_be_checked_ff515d945e"));
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite() {
    if (navigator.share) {
      await navigator.share({ title: uiText("ui.join_me_on_perfectppi_8278cc558b"), text: uiText("ui.join_me_on_perfectppi_to_share_vehicles_buil_2da20a66d2"), url: inviteUrl }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      setMessage(uiText("ui.invite_link_copied_d65176d65e"));
    }
    // KPI: an invite was shared (no recipient details are sent).
    void fetch("/api/analytics/client-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: uiText("ui.invite_shared_04f35f797d") }), keepalive: true }).catch(() => undefined);
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">{uiText("ui.friends_from_your_contacts_671e198762")}</h2>
        <p className="text-xs text-muted-foreground">{uiText("ui.your_browser_asks_which_contacts_to_share_pe_4b704677a9")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={chooseContacts} disabled={busy}>{busy ? uiText("ui.checking_ec963ffc91") : uiText("ui.choose_contacts_81d1a4637b")}</Button>
        <Button type="button" variant="outline" onClick={shareInvite}>{uiText("ui.share_invite_a8da10e56a")}</Button>
      </div>
      {matches.map((match) => (
        <div key={match.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
          <Link href={match.username ? `/profile/${match.username}` : "#"} className="min-w-0">
            <p className="truncate text-sm font-semibold">{match.display_name || (match.username ? uiText("ui.text_d513a96df3", { arg0: String(match.username) }) : uiText("ui.perfectppi_member_99bd607db6"))}</p>
            <p className="text-xs text-muted-foreground">{uiText("ui.from_your_contacts_176ae632a1")}{match.mutual_friend_count ? uiText("ui.mutual_ba94cb8398", { arg0: String(match.mutual_friend_count) }) : ""}</p>
          </Link>
          <FriendActionButton profileId={match.id} state={match.relationship_state} compact />
        </div>
      ))}
      {inviteNames.length ? (
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <p className="font-semibold">{uiText("ui.invite_to_perfectppi_edc049b172")}</p>
          <p className="mt-1 text-muted-foreground">{inviteNames.slice(0, 8).join(", ")}{inviteNames.length > 8 ? uiText("ui.and_more_2facbc5dc3", { arg0: String(inviteNames.length - 8) }) : ""}</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={shareInvite}>{uiText("ui.share_invite_link_fea0cfbcb7")}</Button>
        </div>
      ) : null}
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}

// Digits only, like the server's normalization of verified phone numbers
// (E.164 without the plus). A 10-digit number without a country code is
// also tried with the browser region's code.
function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 7) return [];
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  const code = ({ US: "1", CA: "1", GB: "44", AU: "61", DE: "49", FR: "33" } as Record<string, string>)[region];
  return digits.length === 10 && code ? [digits, code + digits] : [digits];
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
