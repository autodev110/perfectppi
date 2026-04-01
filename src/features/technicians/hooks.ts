"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useTechDirectory(filters?: {
  certification?: string;
  specialty?: string;
}) {
  const [technicians, setTechnicians] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const supabase = createClient();

      let query = supabase
        .from("technician_profiles")
        .select(
          `
          *,
          profile:profiles!technician_profiles_profile_id_fkey(
            id, username, display_name, avatar_url, bio, is_public
          ),
          organization:organizations(id, name, slug, logo_url)
        `
        )
        .order("total_inspections", { ascending: false });

      if (filters?.certification) {
        query = query.eq("certification_level", filters.certification as "none" | "ase" | "master" | "oem_qualified");
      }

      const { data } = await query;
      setTechnicians(data ?? []);
      setLoading(false);
    };

    fetch();
  }, [filters?.certification, filters?.specialty]);

  return { technicians, loading };
}
