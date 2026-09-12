"use client";

import { useState, useEffect } from "react";

export function useTechDirectory(filters?: {
  certification?: string;
  specialty?: string;
}) {
  const [technicians, setTechnicians] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters?.certification) {
          params.set("certification", filters.certification);
        }
        if (filters?.specialty) {
          params.set("specialty", filters.specialty);
        }
        const response = await window.fetch(`/api/technicians?${params}`);
        const body = await response.json();
        if (active) setTechnicians(response.ok ? body.data ?? [] : []);
      } catch {
        if (active) setTechnicians([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetch();
    return () => { active = false; };
  }, [filters?.certification, filters?.specialty]);

  return { technicians, loading };
}
