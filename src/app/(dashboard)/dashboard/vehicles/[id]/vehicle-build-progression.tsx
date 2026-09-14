"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, formatMileage } from "@/lib/utils/formatting";
import {
  BUILD_DOCUMENT_KIND_LABELS,
  BUILD_STAGE_STATUS_LABELS,
  buildProgress,
  groupBuildByStage,
  type BuildStageStatus,
} from "@/lib/vehicles/build-progression";
import { uploadFailureMessage } from "@/lib/uploads/prepare-image";
import type { OwnedVehicleTimelines } from "@/features/vehicles/timelines";
import { ArrowRight, FileText, ImagePlus, Loader2, Paperclip, Trash2 } from "lucide-react";

type Entry = OwnedVehicleTimelines["build"][number];
type Stage = OwnedVehicleTimelines["stages"][number];
type Doc = OwnedVehicleTimelines["documents"][number];
type Media = { id: string; url: string; media_type: string; moderation_status: string };

// Build progression (Renditions doc): stages with progress and private cost
// roll-ups, entries with before/after specs, photos from the vehicle's
// approved media, and private documents. Costs, labor, documents, and
// private notes never appear on the public passport.

function optionalText(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}
function optionalNumber(form: FormData, key: string, multiplier = 1) {
  const value = String(form.get(key) ?? "").trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * multiplier) : null;
}
function optionalDecimal(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function requestJson<T = unknown>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null) as { error?: string; data?: T } | null;
  if (!response.ok) throw new Error(payload?.error ?? "The change could not be saved. Please try again.");
  return payload?.data as T;
}

const inputClass = "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";

export function VehicleBuildProgression({
  vehicleId,
  timelines,
  media,
}: {
  vehicleId: string;
  timelines: OwnedVehicleTimelines;
  media: Media[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const groups = groupBuildByStage(timelines.stages, timelines.build);
  const progress = buildProgress(timelines.stages, timelines.build);
  const approvedMedia = media.filter((item) => item.media_type === "image" && item.moderation_status === "active");
  const documentsFor = (entryId: string | null, stageId: string | null) =>
    timelines.documents.filter((doc) => (entryId && doc.entry_id === entryId) || (stageId && doc.stage_id === stageId && !doc.entry_id));

  async function run(task: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await task();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const base = `/api/vehicles/${vehicleId}/build`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold">Build Progression</h2>
          <p className="mt-1 text-sm text-muted-foreground">Stages group your modifications. Costs, labor, documents, and private notes stay visible only to you.</p>
        </div>
        {progress.total > 0 ? (
          <div className="min-w-48 text-right">
            <p className="text-xs font-semibold text-muted-foreground">
              {timelines.stages.length > 0 ? `${progress.done} of ${progress.total} stages complete` : `${progress.done} of ${progress.total} entries installed`}
            </p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      {/* Stage form */}
      <details className="rounded-xl border bg-muted/20 p-4" open={timelines.stages.length === 0 && timelines.build.length > 0}>
        <summary className="cursor-pointer font-semibold">Add stage</summary>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          action={(form) => run(() => requestJson(`${base}/stages`, "POST", {
            title: String(form.get("title") ?? ""), description: optionalText(form, "description"),
            status: String(form.get("status") ?? "planned"), target_date: optionalText(form, "target_date"),
            is_public: form.get("is_public") === "on",
          }), "The stage could not be saved.")}
        >
          <div className="space-y-2"><Label htmlFor="stage-title">Stage title *</Label><Input id="stage-title" name="title" required maxLength={120} placeholder="Stage 1: Bolt-ons" /></div>
          <div className="space-y-2"><Label htmlFor="stage-status">Status</Label>
            <select id="stage-status" name="status" className={inputClass} defaultValue="planned">
              {(Object.keys(BUILD_STAGE_STATUS_LABELS) as BuildStageStatus[]).map((status) => <option key={status} value={status}>{BUILD_STAGE_STATUS_LABELS[status]}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="stage-target">Target date</Label><Input id="stage-target" name="target_date" type="date" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="stage-description">Goal</Label><Textarea id="stage-description" name="description" maxLength={2000} rows={2} placeholder="What this stage is meant to achieve" /></div>
          <label className="flex items-start gap-3 rounded-xl border p-3 sm:col-span-2"><input className="mt-1" type="checkbox" name="is_public" /><span><span className="block text-sm font-medium">Show this stage on the public Vehicle Passport</span><span className="block text-xs text-muted-foreground">Only the stage name, goal, status, and its shared entries are visible. Never costs.</span></span></label>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Add Stage</Button></div>
        </form>
      </details>

      {/* Entry form */}
      <details className="rounded-xl border bg-muted/20 p-4" open={timelines.build.length === 0}>
        <summary className="cursor-pointer font-semibold">Add build entry</summary>
        <form className="mt-4 space-y-4" action={(form) => run(() => requestJson(base, "POST", entryPayload(form)), "The build entry could not be saved.")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title *" name="title" required maxLength={160} placeholder="Coilover installation" />
            <Field label="Category *" name="category" required maxLength={80} placeholder="Suspension" />
            <div className="space-y-2"><Label htmlFor="entry-stage">Stage</Label>
              <select id="entry-stage" name="stage_id" className={inputClass} defaultValue="">
                <option value="">No stage</option>
                {timelines.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
              </select>
            </div>
            <SelectField label="Status" name="status" options={["planned", "installed", "removed", "sold"]} />
            <Field label="Manufacturer" name="manufacturer" maxLength={120} />
            <Field label="Part number" name="part_number" maxLength={100} />
            <Field label="Install date" name="installed_on" type="date" />
            <Field label="Install mileage" name="mileage" type="number" min={0} />
            <SelectField label="Installed by" name="installation_kind" options={["unknown", "self_installed", "shop_installed"]} />
            <Field label="Shop" name="shop_name" maxLength={160} />
            <Field label="Parts cost (USD, private)" name="cost" type="number" min={0} step="0.01" />
            <Field label="Labor cost (USD, private)" name="labor" type="number" min={0} step="0.01" />
            <Field label="Labor hours (private)" name="labor_hours" type="number" min={0} step="0.1" />
            <Field label="Before" name="before_spec" maxLength={300} placeholder="Stock airbox, 200 hp" />
            <Field label="After" name="after_spec" maxLength={300} placeholder="Cold-air intake, 212 hp" />
            <Field label="Vehicle configuration" name="vehicle_configuration" maxLength={500} />
            <Field label="Wheel size" name="wheel_size" maxLength={40} placeholder="18 in" />
            <Field label="Wheel width" name="wheel_width" type="number" min={0} step="0.01" />
            <Field label="Wheel offset (mm)" name="wheel_offset_mm" type="number" step="0.1" />
            <Field label="Tire size" name="tire_size" maxLength={40} placeholder="245/40R18" />
            <Field label="Suspension drop" name="suspension_drop" maxLength={80} />
          </div>
          <div className="space-y-2"><Label htmlFor="public_notes">Public notes</Label><Textarea id="public_notes" name="public_notes" maxLength={5000} rows={3} /></div>
          <div className="space-y-2"><Label htmlFor="private_notes">Private notes</Label><Textarea id="private_notes" name="private_notes" maxLength={5000} rows={3} /></div>
          <label className="flex items-start gap-3 rounded-xl border p-3"><input className="mt-1" type="checkbox" name="is_public" /><span><span className="block text-sm font-medium">Show on public Vehicle Passport</span><span className="block text-xs text-muted-foreground">Public fields, before/after, and attached photos are shared. Cost, labor, documents, and private notes remain private.</span></span></label>
          <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Add Build Entry"}</Button>
        </form>
      </details>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No build entries yet. Add a stage to plan the progression, or add an entry directly.</p>
      ) : (
        groups.map((group) => (
          <section key={group.stage?.id ?? "unstaged"} className="rounded-2xl border p-4 sm:p-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-bold">{group.stage?.title ?? "Unstaged entries"}</h3>
                {group.stage ? (
                  <p className="text-xs text-muted-foreground">
                    {BUILD_STAGE_STATUS_LABELS[group.stage.status]}
                    {group.stage.target_date ? ` · target ${formatDate(group.stage.target_date)}` : ""}
                    {group.stage.completed_on ? ` · completed ${formatDate(group.stage.completed_on)}` : ""}
                    {` · ${group.stage.is_public ? "Shared" : "Private"}`}
                  </p>
                ) : null}
                {group.stage?.description ? <p className="mt-1 text-sm">{group.stage.description}</p> : null}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{group.totals.installed_count}/{group.totals.entry_count} installed</p>
                {group.totals.parts_cents + group.totals.labor_cents > 0 ? (
                  <p>{formatCurrency(group.totals.parts_cents)} parts{group.totals.labor_cents ? ` + ${formatCurrency(group.totals.labor_cents)} labor` : ""}{group.totals.labor_hours ? ` · ${group.totals.labor_hours} h` : ""} <span className="font-semibold">(private)</span></p>
                ) : null}
              </div>
            </header>
            {group.stage ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  aria-label="Change stage status"
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  value={group.stage.status}
                  disabled={busy}
                  onChange={(event) => run(() => requestJson(`${base}/stages/${group.stage!.id}`, "PATCH", { status: event.target.value }), "The stage could not be updated.")}
                >
                  {(Object.keys(BUILD_STAGE_STATUS_LABELS) as BuildStageStatus[]).map((status) => <option key={status} value={status}>{BUILD_STAGE_STATUS_LABELS[status]}</option>)}
                </select>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => requestJson(`${base}/stages/${group.stage!.id}`, "PATCH", { is_public: !group.stage!.is_public }), "The stage could not be updated.")}>
                  {group.stage.is_public ? "Make private" : "Share on passport"}
                </Button>
                <DocumentUploader vehicleId={vehicleId} stageId={group.stage.id} entryId={null} onDone={() => router.refresh()} onError={setError} />
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm("Delete this stage? Its entries are kept and become unstaged.")) void run(() => requestJson(`${base}/stages/${group.stage!.id}`, "DELETE"), "The stage could not be deleted."); }}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Delete stage
                </Button>
              </div>
            ) : null}
            <DocumentList vehicleId={vehicleId} documents={documentsFor(null, group.stage?.id ?? null)} onChanged={() => router.refresh()} onError={setError} />
            <div className="mt-4 space-y-3">
              {group.entries.length === 0 ? <p className="text-sm text-muted-foreground">No entries in this stage yet.</p> : null}
              {group.entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  stages={timelines.stages}
                  media={approvedMedia}
                  documents={documentsFor(entry.id, null)}
                  vehicleId={vehicleId}
                  busy={busy}
                  onError={setError}
                  onRun={run}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function EntryCard({ entry, stages, media, documents, vehicleId, busy, onError, onRun }: {
  entry: Entry;
  stages: Stage[];
  media: Media[];
  documents: Doc[];
  vehicleId: string;
  busy: boolean;
  onError: (message: string | null) => void;
  onRun: (task: () => Promise<unknown>, fallback: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pickingPhotos, setPickingPhotos] = useState(false);
  const [selected, setSelected] = useState<string[]>(entry.photos.map((photo) => photo.media_id));
  const base = `/api/vehicles/${vehicleId}/build`;

  return (
    <article className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{entry.title}</p>
          <p className="text-sm text-muted-foreground">{entry.category} · {entry.status.replaceAll("_", " ")}</p>
        </div>
        <span className="text-xs text-muted-foreground">{entry.is_public ? "Shared" : "Private"}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {entry.manufacturer && <span>{entry.manufacturer}{entry.part_number ? ` · ${entry.part_number}` : ""}</span>}
        {entry.installed_on && <span>{formatDate(entry.installed_on)}</span>}
        {entry.mileage != null && <span>{formatMileage(entry.mileage)} mi</span>}
        {entry.shop_name && <span>{entry.shop_name}</span>}
        {(entry.cost_cents != null || entry.labor_cents != null) && (
          <span>
            {entry.cost_cents != null ? `${formatCurrency(entry.cost_cents)} parts` : ""}
            {entry.labor_cents != null ? `${entry.cost_cents != null ? " + " : ""}${formatCurrency(entry.labor_cents)} labor` : ""}
            {entry.labor_hours != null ? ` · ${entry.labor_hours} h` : ""} (private)
          </span>
        )}
      </div>
      {(entry.before_spec || entry.after_spec) && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg bg-muted px-2 py-1">{entry.before_spec ?? "—"}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="rounded-lg bg-primary/10 px-2 py-1 font-medium">{entry.after_spec ?? "—"}</span>
        </p>
      )}
      {entry.public_notes && <p className="mt-3 whitespace-pre-wrap text-sm">{entry.public_notes}</p>}
      {entry.private_notes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm"><strong>Private:</strong> {entry.private_notes}</p>}

      {entry.photos.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.media_id} src={photo.url} alt="" className="h-16 w-20 rounded-lg object-cover" />
          ))}
        </div>
      ) : null}

      {pickingPhotos ? (
        <div className="mt-3 rounded-xl border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Choose from this vehicle&rsquo;s approved photos. Upload new ones from the Overview tab first.</p>
          {media.length === 0 ? <p className="mt-2 text-sm">No approved photos yet.</p> : (
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {media.map((item) => {
                const on = selected.includes(item.id);
                return (
                  <button key={item.id} type="button" aria-pressed={on} onClick={() => setSelected((current) => on ? current.filter((id) => id !== item.id) : [...current, item.id])} className={`relative aspect-[4/3] overflow-hidden rounded-lg border-2 ${on ? "border-primary" : "border-transparent"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                    {on ? <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{selected.indexOf(item.id) + 1}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => onRun(() => requestJson(`${base}/${entry.id}/photos`, "PUT", { media_ids: selected }).then(() => setPickingPhotos(false)), "The photos could not be saved.")}>Save photos</Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelected(entry.photos.map((photo) => photo.media_id)); setPickingPhotos(false); }}>Cancel</Button>
          </div>
        </div>
      ) : null}

      <DocumentList vehicleId={vehicleId} documents={documents} onChanged={() => router.refresh()} onError={onError} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Move to stage"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          value={entry.stage_id ?? ""}
          disabled={busy}
          onChange={(event) => onRun(() => requestJson(`${base}/${entry.id}`, "PATCH", { stage_id: event.target.value || null }), "The entry could not be moved.")}
        >
          <option value="">No stage</option>
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setPickingPhotos((value) => !value)}><ImagePlus className="mr-1 h-3.5 w-3.5" />Photos</Button>
        <DocumentUploader vehicleId={vehicleId} entryId={entry.id} stageId={null} onDone={() => router.refresh()} onError={onError} />
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm("Delete this build entry? This cannot be undone.")) void onRun(() => requestJson(`${base}/${entry.id}`, "DELETE"), "The build entry could not be deleted."); }}>Delete</Button>
      </div>
    </article>
  );
}

function DocumentList({ vehicleId, documents, onChanged, onError }: { vehicleId: string; documents: Doc[]; onChanged: () => void; onError: (message: string | null) => void }) {
  if (documents.length === 0) return null;
  async function open(doc: Doc) {
    try {
      // A short-lived signed URL; the document itself has no public address.
      const response = await fetch(`/api/vehicles/${vehicleId}/build/documents/${doc.id}`);
      const payload = await response.json().catch(() => null) as { data?: { url: string }; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "The document could not be opened.");
      window.open(payload.data.url, "_blank", "noopener");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The document could not be opened.");
    }
  }
  async function remove(doc: Doc) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await requestJson(`/api/vehicles/${vehicleId}/build/documents/${doc.id}`, "DELETE");
      onChanged();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The document could not be deleted.");
    }
  }
  return (
    <ul className="mt-3 space-y-1">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <button type="button" onClick={() => open(doc)} className="min-w-0 truncate font-medium hover:underline">{doc.title}</button>
          <span className="shrink-0 text-xs text-muted-foreground">{BUILD_DOCUMENT_KIND_LABELS[doc.kind]} · {Math.max(1, Math.round(doc.size_bytes / 1024))} KB · private</span>
          <button type="button" onClick={() => remove(doc)} aria-label={`Delete ${doc.title}`} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </li>
      ))}
    </ul>
  );
}

// Private document upload: presigned PUT (or the server fallback) with the
// `vehicle_document` entity, then the record. Receipts never get a public URL.
function DocumentUploader({ vehicleId, entryId, stageId, onDone, onError }: { vehicleId: string; entryId: string | null; stageId: string | null; onDone: () => void; onError: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    onError(null);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("Documents can be up to 25 MB.");
      const presign = await fetch("/api/upload/presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, entity: "vehicle_document", recordId: vehicleId }),
      });
      let reference: string;
      if (presign.ok) {
        const { uploadUrl, publicUrl } = await presign.json() as { uploadUrl: string; publicUrl: string };
        const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } }).catch(() => null);
        reference = put?.ok ? publicUrl : await uploadDirect(file);
      } else if (presign.status === 400 || presign.status === 404) {
        throw new Error(await uploadFailureMessage(presign, "The document could not be uploaded."));
      } else {
        reference = await uploadDirect(file);
      }
      const kind = /receipt/i.test(file.name) ? "receipt" : /invoice/i.test(file.name) ? "invoice" : /dyno/i.test(file.name) ? "dyno_sheet" : "other";
      await requestJson(`/api/vehicles/${vehicleId}/build/documents`, "POST", {
        storage_reference: reference, title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Document", kind,
        entry_id: entryId, stage_id: stageId, content_type: file.type || "application/octet-stream", size_bytes: file.size,
      });
      onDone();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The document could not be uploaded.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function uploadDirect(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    form.append("entity", "vehicle_document");
    form.append("recordId", vehicleId);
    const response = await fetch("/api/upload/direct", { method: "POST", body: form });
    if (!response.ok) throw new Error(await uploadFailureMessage(response, "The document could not be uploaded."));
    const payload = await response.json() as { publicUrl: string };
    return payload.publicUrl;
  }

  return (
    <>
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <Button size="sm" variant="outline" type="button" disabled={uploading} onClick={() => input.current?.click()}>
        {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1 h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : "Receipt / document"}
      </Button>
    </>
  );
}

function entryPayload(form: FormData) {
  return {
    category: String(form.get("category") ?? ""), title: String(form.get("title") ?? ""),
    stage_id: optionalText(form, "stage_id"),
    manufacturer: optionalText(form, "manufacturer"), part_number: optionalText(form, "part_number"),
    vehicle_configuration: optionalText(form, "vehicle_configuration"), wheel_size: optionalText(form, "wheel_size"),
    wheel_width: optionalDecimal(form, "wheel_width"), wheel_offset_mm: optionalDecimal(form, "wheel_offset_mm"),
    tire_size: optionalText(form, "tire_size"), suspension_drop: optionalText(form, "suspension_drop"),
    installed_on: optionalText(form, "installed_on"), mileage: optionalNumber(form, "mileage"),
    installation_kind: String(form.get("installation_kind") ?? "unknown"), shop_name: optionalText(form, "shop_name"),
    cost_cents: optionalNumber(form, "cost", 100), labor_cents: optionalNumber(form, "labor", 100), labor_hours: optionalDecimal(form, "labor_hours"),
    before_spec: optionalText(form, "before_spec"), after_spec: optionalText(form, "after_spec"),
    public_notes: optionalText(form, "public_notes"), private_notes: optionalText(form, "private_notes"),
    status: String(form.get("status") ?? "installed"), is_public: form.get("is_public") === "on",
  };
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return <div className="space-y-2"><Label htmlFor={`entry-${name}`}>{label}</Label><Input id={`entry-${name}`} name={name} {...props} /></div>;
}

function SelectField({ label, name, options }: { label: string; name: string; options: string[] }) {
  return <div className="space-y-2"><Label htmlFor={`entry-${name}`}>{label}</Label><select id={`entry-${name}`} name={name} className={inputClass}>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></div>;
}
