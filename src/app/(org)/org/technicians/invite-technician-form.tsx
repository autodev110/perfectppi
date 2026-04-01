"use client";

import { useState } from "react";
import { inviteTechnicianToOrg } from "@/features/organizations/invite-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils/formatting";
import { Search, UserPlus } from "lucide-react";

type TechResult = {
  id: string;
  certification_level: string;
  total_inspections: number;
  profile: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

const CERT_LABELS: Record<string, string> = {
  none: "Uncertified",
  ase: "ASE",
  master: "ASE Master",
  oem_qualified: "OEM Qualified",
};

export function InviteTechnicianForm() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TechResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; type: "success" | "error"; text: string } | null>(null);

  async function handleSearch() {
    if (!search.trim()) return;
    setSearching(true);
    setResults([]);
    setMessage(null);

    const supabase = createClient();
    const { data } = await supabase
      .from("technician_profiles")
      .select(
        `id, certification_level, total_inspections,
         profile:profiles!technician_profiles_profile_id_fkey(id, display_name, username, avatar_url)`
      )
      .eq("is_independent", true)
      .or(
        `profile.display_name.ilike.%${search}%,profile.username.ilike.%${search}%`
      )
      .limit(10);

    setResults((data as TechResult[]) ?? []);
    setSearching(false);
  }

  async function handleInvite(techId: string) {
    setInviting(techId);
    setMessage(null);
    const result = await inviteTechnicianToOrg(techId);
    setInviting(null);

    if ("error" in result) {
      setMessage({ id: techId, type: "error", text: result.error });
    } else {
      setMessage({ id: techId, type: "success", text: "Technician added to your organization." });
      setResults((prev) => prev.filter((t) => t.id !== techId));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search by name or username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={handleSearch} disabled={searching}>
          <Search className="mr-2 h-4 w-4" />
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>

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
                      {getInitials(profile?.display_name ?? "T")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{profile?.display_name ?? "Unknown"}</p>
                    <div className="flex items-center gap-2">
                      {profile?.username && (
                        <span className="text-xs text-muted-foreground">@{profile.username}</span>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {CERT_LABELS[tech.certification_level] ?? tech.certification_level}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {tech.total_inspections} inspections
                      </span>
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
                    {isInviting ? "Adding…" : "Add"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!searching && search && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No independent technicians found for &quot;{search}&quot;</p>
      )}
    </div>
  );
}
