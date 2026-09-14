// Build progression (Renditions doc): stages group build entries; this pure
// module orders and groups them, computes progress, and formats owner-only
// cost roll-ups. Public callers pass public entries and no totals.

export type BuildStageStatus = "planned" | "in_progress" | "complete" | "on_hold";

export const BUILD_STAGE_STATUS_LABELS: Record<BuildStageStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  complete: "Complete",
  on_hold: "On hold",
};

export const BUILD_DOCUMENT_KIND_LABELS = {
  receipt: "Receipt",
  invoice: "Invoice",
  warranty: "Warranty",
  dyno_sheet: "Dyno sheet",
  alignment: "Alignment sheet",
  other: "Document",
} as const;

export type BuildStageLike = {
  id: string;
  title: string;
  position: number;
  status: BuildStageStatus;
  created_at: string;
};

export type BuildEntryLike = {
  id: string;
  stage_id: string | null;
  status: "planned" | "installed" | "removed" | "sold";
  installed_on: string | null;
  created_at: string;
};

export type StageTotals = {
  entry_count: number;
  installed_count: number;
  parts_cents: number;
  labor_cents: number;
  labor_hours: number;
};

export type StageGroup<S extends BuildStageLike, E extends BuildEntryLike> = {
  stage: S | null;
  entries: E[];
  /** Installed entries over all entries in the stage (0 when empty). */
  progress: number;
  totals: StageTotals;
};

export function sortStages<S extends BuildStageLike>(stages: S[]): S[] {
  return [...stages].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

export function sortEntries<E extends BuildEntryLike>(entries: E[]): E[] {
  return [...entries].sort((a, b) => {
    if (a.installed_on && b.installed_on && a.installed_on !== b.installed_on) return b.installed_on.localeCompare(a.installed_on);
    if (!!a.installed_on !== !!b.installed_on) return a.installed_on ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

function emptyTotals(): StageTotals {
  return { entry_count: 0, installed_count: 0, parts_cents: 0, labor_cents: 0, labor_hours: 0 };
}

/**
 * Groups entries under their stages (in stage order) followed by an
 * "unstaged" group when any entry has no stage. Totals are derived from
 * the entries handed in, so passing public entries yields public counts and
 * zero costs.
 */
export function groupBuildByStage<S extends BuildStageLike, E extends BuildEntryLike & { cost_cents?: number | null; labor_cents?: number | null; labor_hours?: number | null }>(
  stages: S[],
  entries: E[],
): StageGroup<S, E>[] {
  const byStage = new Map<string | null, E[]>();
  for (const entry of sortEntries(entries)) {
    const key = entry.stage_id && stages.some((stage) => stage.id === entry.stage_id) ? entry.stage_id : null;
    byStage.set(key, [...(byStage.get(key) ?? []), entry]);
  }
  const toGroup = (stage: S | null, list: E[]): StageGroup<S, E> => {
    const totals = list.reduce<StageTotals>((acc, entry) => ({
      entry_count: acc.entry_count + 1,
      installed_count: acc.installed_count + (entry.status === "installed" ? 1 : 0),
      parts_cents: acc.parts_cents + (entry.cost_cents ?? 0),
      labor_cents: acc.labor_cents + (entry.labor_cents ?? 0),
      labor_hours: acc.labor_hours + (entry.labor_hours ?? 0),
    }), emptyTotals());
    return { stage, entries: list, progress: totals.entry_count ? totals.installed_count / totals.entry_count : 0, totals };
  };
  const groups = sortStages(stages).map((stage) => toGroup(stage, byStage.get(stage.id) ?? []));
  const unstaged = byStage.get(null) ?? [];
  if (unstaged.length > 0) groups.push(toGroup(null, unstaged));
  return groups;
}

/** Overall progression: complete stages over all stages, or installed entries when there are no stages. */
export function buildProgress(stages: BuildStageLike[], entries: BuildEntryLike[]): { done: number; total: number; percent: number } {
  if (stages.length > 0) {
    const done = stages.filter((stage) => stage.status === "complete").length;
    return { done, total: stages.length, percent: Math.round((done / stages.length) * 100) };
  }
  const done = entries.filter((entry) => entry.status === "installed").length;
  return { done, total: entries.length, percent: entries.length ? Math.round((done / entries.length) * 100) : 0 };
}

/** "Stage 1: Bolt-ons" → the numeral if present, for compact chips. */
export function stageShortLabel(title: string): string {
  const match = title.match(/stage\s*(\d+)/i);
  return match ? `S${match[1]}` : title.slice(0, 12);
}
