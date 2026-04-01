"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVehicles = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (!profile) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("vehicles")
        .select("*")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: false });

      setVehicles(data ?? []);
      setLoading(false);
    };

    fetchVehicles();
  }, []);

  return { vehicles, loading };
}
