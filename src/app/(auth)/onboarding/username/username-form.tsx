"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UsernameInput } from "@/components/shared/username-input";
import { usernameSchema } from "@/features/profiles/username";

export function UsernameForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setSaving(true);
    setError(null);
    const response = await fetch("/api/profiles/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: parsed.data }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.error ?? "Your username could not be saved. Please try again.");
      setSaving(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <UsernameInput value={username} onChange={setUsername} autoFocus />
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={saving || !usernameSchema.safeParse(username).success}
        className="h-12 w-full rounded-xl bg-on-tertiary-container font-heading font-bold text-white disabled:opacity-50"
      >
        {saving ? "Saving username..." : "Continue"}
      </button>
    </form>
  );
}

