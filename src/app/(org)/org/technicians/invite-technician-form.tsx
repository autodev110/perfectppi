"use client";

import { useState } from "react";
import { inviteTechnicianToOrg } from "@/features/organizations/invite-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils/formatting";
import { Search, UserPlus } from "lucide-react";

import { useTranslator } from "@/lib/i18n/client";

type TechResult = {
  id: string;
  total_inspections: number;
  profile: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

export function InviteTechnicianForm() {
  const uiText = useTranslator();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TechResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; type: "success" | "error"; text: string } | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  async function handleSearch() {
    const term = search.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
    if (!term) return;
    setSearching(true);
    setResults([]);
    setMessage(null);
    setSearchMessage(null);

    const supabase = createClient();
    let query = supabase
      .from("technician_profiles")
      .select(
        `id, total_inspections,
         profile:profiles!technician_profiles_profile_id_fkey!inner(id, display_name, username, avatar_url)`
      )
      .eq("is_independent", true)
      .limit(10);

    query = query.or(
      `display_name.ilike.%${term}%,username.ilike.%${term}%`,
      { referencedTable: "profile" }
    );

    const { data, error } = await query;

    if (error) {
      setSearchMessage(uiText("ui.search_failed_try_again_and_make_sure_the_te_5b9073a079"));
      setSearching(false);
      return;
    }

    setResults((data as TechResult[]) ?? []);
    if (!data || data.length === 0) {
      setSearchMessage(
        uiText("ui.no_matching_independent_technicians_found_th_278819261c")
      );
    }
    setSearching(false);
  }

  async function handleInvite(techId: string) {
    setInviting(techId);
    setMessage(null);
    const result = await inviteTechnicianToOrg(techId);
    setInviting(null);

    if (result.error) {
      setMessage({ id: techId, type: "error", text: result.error });
    } else {
      setMessage({ id: techId, type: "success", text: uiText("ui.technician_added_to_your_organization_1f3ef2ef2c") });
      setResults((prev) => prev.filter((t) => t.id !== techId));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{uiText("ui.search_only_finds_independent_technician_acc_a05a91d58e")}</p>

      <div className="flex gap-2">
        <Input
          placeholder={uiText("ui.search_technicians_by_name_or_username_51b690b71e")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={handleSearch} disabled={searching}>
          <Search className="mr-2 h-4 w-4" />
          {searching ? uiText("ui.searching_c31723ab33") : uiText("ui.search_49c266baaa")}
        </Button>
      </div>

      {searchMessage && (
        <p className="text-sm text-muted-foreground">{searchMessage}</p>
      )}

      {results.length > 0 && (
        <div className="divide-y rounded-lg border">
          {results.map((tech) => {
            const profile = tech.profile;
            const isInviting = inviting === tech.id;
            const msg = message?.id === tech.id ? message : null;

            return (
              <div key={tech.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.avatar_url ?? ""} />
                    <AvatarFallback className="text-xs">
                      {getInitials(profile?.display_name ?? uiText("ui.t_e632b7095b"))}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{profile?.display_name ?? uiText("ui.unknown_b764cdc0ea")}</p>
                    <div className="flex items-center gap-2">
                      {profile?.username && (
                        <span className="text-xs text-muted-foreground">@{profile.username}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {tech.total_inspections}{uiText("ui.inspections_72d3585c34")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {msg && (
                    <p className={`text-xs ${msg.type === "error" ? "text-destructive" : "text-teal-600"}`}>
                      {msg.text}
                    </p>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleInvite(tech.id)}
                    disabled={isInviting || msg?.type === "success"}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {isInviting ? uiText("ui.adding_c6de6f45c8") : uiText("ui.add_9fd728c66c")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!searching && search && results.length === 0 && !searchMessage && (
        <p className="text-sm text-muted-foreground">{uiText("ui.no_independent_technicians_found_for_859c0f0de6")}{search}&quot;</p>
      )}
    </div>
  );
}
