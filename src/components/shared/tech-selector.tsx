"use client";

import { useState, useEffect } from "react";
import { Search, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";

interface TechOption {
  id: string; // technician_profiles.id
  profile_id: string;
  certification_level: string;
  specialties: string[];
  total_inspections: number;
  is_independent: boolean;
  profile: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

interface TechSelectorProps {
  selectedId: string | null;
  onSelect: (techProfileId: string, name: string) => void;
}

const CERT_LABELS: Record<string, string> = {
  none: "Uncertified",
  ase: "ASE Certified",
  master: "ASE Master",
  oem_qualified: "OEM Qualified",
};

const CERT_COLORS: Record<string, string> = {
  none: "bg-orange-100 text-orange-700",
  ase: "bg-slate-100 text-slate-700",
  master: "bg-amber-100 text-amber-700",
  oem_qualified: "bg-amber-100 text-amber-700",
};

export function TechSelector({ selectedId, onSelect }: TechSelectorProps) {
  const [techs, setTechs] = useState<TechOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [certFilter, setCertFilter] = useState<string>("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (certFilter) params.set("certification", certFilter);
        const res = await fetch(`/api/technicians?${params}`);
        if (res.ok) {
          const json = await res.json();
          setTechs(Array.isArray(json) ? json : json.data ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [certFilter]);

  const filtered = techs.filter((t) => {
    const name = t.profile.display_name ?? t.profile.username ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search technicians..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Cert filter */}
      <div className="flex flex-wrap gap-2">
        {["", "ase", "master", "oem_qualified"].map((cert) => (
          <button
            key={cert}
            onClick={() => setCertFilter(cert)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              certFilter === cert
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {cert === "" ? "All" : CERT_LABELS[cert]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {loading && (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No technicians found</p>
        )}
        {filtered.map((tech) => {
          const name = tech.profile.display_name ?? tech.profile.username ?? "Unknown";
          const selected = selectedId === tech.id;

          return (
            <button
              key={tech.id}
              onClick={() => onSelect(tech.id, name)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 bg-background"
              )}
            >
              <UserAvatar
                name={name}
                src={tech.profile.avatar_url}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">{name}</span>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      CERT_COLORS[tech.certification_level] ?? CERT_COLORS.none
                    )}
                  >
                    {CERT_LABELS[tech.certification_level] ?? "Uncertified"}
                  </span>
                </div>
                {tech.organization && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {tech.organization.name}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {tech.total_inspections} inspection{tech.total_inspections !== 1 ? "s" : ""}
                </p>
                {tech.specialties?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tech.specialties.slice(0, 3).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs py-0">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {selected && (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
