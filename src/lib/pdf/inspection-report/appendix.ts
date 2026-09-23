import { ReportCanvas, type StatusName } from "./canvas.ts";

// ============================================================================
// Photo evidence appendix: a separate, unlimited-length PDF with every finding,
// the complete answer record and every uploaded photo of one frozen inspection
// version. Pagination is data-driven; nothing is capped or silently dropped.
// ============================================================================

export const APPENDIX_TEMPLATE_VERSION = "ppi-appendix-1.0.0";

export interface AppendixPhoto {
  evidence_id: string;
  media_id: string;
  title: string;
  association: string;
  caption: string;
  provenance: string;
  /** JPEG bytes already normalized (upright) by the caller, or null when unavailable. */
  image: { jpeg: Uint8Array; width: number; height: number } | null;
  unavailable_reason?: string | null;
}

export interface AppendixViewModel {
  report_ref: string;
  vehicle: string;
  date: string;
  inspector: string;
  scope_label: string;
  certification_line: string;
  generated_line: string;
  findings: { ref: string; status: StatusName; title: string; text: string }[];
  answers: { section: string; prompt: string; value: string }[];
  notes: { section: string; text: string }[];
  photos: AppendixPhoto[];
  other_media: { evidence_id: string; media_id: string; type: string; association: string }[];
}

type PagePlan =
  | { kind: "index"; entries: IndexEntry[]; first: boolean }
  | { kind: "findings"; items: { ref: string; status: StatusName; title: string; lines: string[] }[] }
  | { kind: "answers"; items: { heading?: string; lines: string[] }[] }
  | { kind: "photo"; photo: AppendixPhoto; captionLines: string[] }
  | { kind: "caption"; photo: AppendixPhoto; lines: string[] };

interface IndexEntry {
  label: string;
  target: string;
  page?: number;
}

const CONTENT_WIDTH_PAD = 30;

function header(c: ReportCanvas, vm: AppendixViewModel, subtitle: string) {
  c.text("PERFECTPPI", c.M, 28, { size: 16.5, bold: true, color: c.C.navy });
  c.text("PHOTO EVIDENCE APPENDIX", c.W - c.M, 34, { size: 8.3, bold: true, color: c.C.muted, align: "right" });
  c.text("Full findings & photo evidence", c.M, 63, { size: 21, bold: true, color: c.C.navy });
  const vehicleSize = c.fitSize(vm.vehicle, [10, 8.5, 7], c.W - 2 * c.M, true) ?? 7;
  c.text(c.fits(vm.vehicle, vehicleSize, c.W - 2 * c.M, true) ? vm.vehicle : c.wrap(vm.vehicle, c.W - 2 * c.M, 7, true)[0], c.M, 95, { size: vehicleSize, bold: true });
  const meta = `${vm.report_ref}  |  ${vm.date}  |  ${vm.inspector}`;
  const metaLine = c.fits(meta, 8.3, c.W - 2 * c.M) ? meta : c.wrap(meta, c.W - 2 * c.M, 8.3)[0];
  c.text(metaLine, c.M, 113, { size: 8.3, color: c.C.muted });
  c.text(subtitle, c.M, 138, { size: 9, bold: true, color: c.C.blue });
  c.line(c.M, 154, c.W - c.M, 154, c.C.navy, 0.8);
}

function footer(c: ReportCanvas, vm: AppendixViewModel, page: number, total: number) {
  c.line(c.M, 753, c.W - c.M, 753);
  c.text(vm.report_ref || "PERFECTPPI", c.M, 764, { size: 7.1, bold: true, color: c.C.muted });
  c.text(`APPENDIX | ${page} / ${total}`, c.W - c.M, 764, { size: 7.5, bold: true, color: c.C.muted, align: "right" });
}

function plan(c: ReportCanvas, vm: AppendixViewModel): PagePlan[] {
  const top = 171;
  const bottom = 730;
  const width = c.W - 2 * c.M;
  const pages: PagePlan[] = [];

  // Findings: every finding in full, continuing across pages.
  const findingPages: PagePlan[] = [];
  let current: { ref: string; status: StatusName; title: string; lines: string[] }[] = [];
  let used = 0;
  const findingLeading = 12;
  const findingBudget = bottom - top;
  for (const finding of vm.findings) {
    let lines = c.wrap(finding.text, width - CONTENT_WIDTH_PAD, 9.2);
    let continued = false;
    while (lines.length) {
      const room = Math.floor((findingBudget - used - 38) / findingLeading);
      if (room < 1) {
        findingPages.push({ kind: "findings", items: current });
        current = [];
        used = 0;
        continue;
      }
      const chunk = lines.slice(0, room);
      lines = lines.slice(room);
      current.push({ ref: finding.ref, status: finding.status, title: `${finding.title}${continued ? " (continued)" : ""}`, lines: chunk });
      used += chunk.length * findingLeading + 38;
      continued = true;
    }
  }
  if (current.length || findingPages.length === 0) findingPages.push({ kind: "findings", items: current });

  // Answer record: every recorded answer and note, as recorded.
  const answerPages: PagePlan[] = [];
  let answerItems: { heading?: string; lines: string[] }[] = [];
  let answerUsed = 0;
  const answerLeading = 10.5;
  const pushAnswer = (item: { heading?: string; lines: string[] }) => {
    const height = item.lines.length * answerLeading + (item.heading ? 18 : 3);
    if (answerUsed + height > findingBudget && answerItems.length) {
      answerPages.push({ kind: "answers", items: answerItems });
      answerItems = [];
      answerUsed = 0;
    }
    answerItems.push(item);
    answerUsed += height;
  };
  let lastSection = "";
  for (const answer of vm.answers) {
    const heading = answer.section !== lastSection ? answer.section : undefined;
    lastSection = answer.section;
    pushAnswer({ heading, lines: c.wrap(`${answer.prompt}: ${answer.value}`, width, 8.4) });
  }
  for (const note of vm.notes) {
    pushAnswer({ heading: `${note.section} — inspector note (as recorded)`, lines: c.wrap(note.text, width, 8.4) });
  }
  if (answerItems.length) answerPages.push({ kind: "answers", items: answerItems });

  // Photos: one per page; long captions continue on their own pages.
  const photoPages: PagePlan[] = [];
  for (const photo of vm.photos) {
    const text = [photo.caption, photo.provenance].filter(Boolean).join("\n");
    const lines = c.wrap(text, width, 9.5);
    const firstRoom = Math.floor(70 / 13);
    photoPages.push({ kind: "photo", photo, captionLines: lines.slice(0, firstRoom) });
    let rest = lines.slice(firstRoom);
    while (rest.length) {
      const room = Math.floor((bottom - 202) / 13);
      photoPages.push({ kind: "caption", photo, lines: rest.slice(0, room) });
      rest = rest.slice(room);
    }
  }

  // Index entries point at the pages above; sized first, numbered after.
  const indexEntries: IndexEntry[] = [
    { label: "Complete finding record", target: "findings" },
    { label: "Recorded answers and notes", target: "answers" },
    ...vm.photos.map((photo) => ({ label: `${photo.evidence_id}  ${photo.title}${photo.image ? "" : " (unavailable)"}`, target: `photo:${photo.media_id}` })),
    ...vm.other_media.map((media) => ({
      label: `${media.evidence_id}  ${media.type} — not embedded; view it in the digital report`,
      target: `other:${media.media_id}`,
    })),
  ];
  const summaryHeight = 150;
  const indexLeading = 12;
  const firstRoom = Math.floor((findingBudget - summaryHeight) / indexLeading);
  const laterRoom = Math.floor(findingBudget / indexLeading);
  const indexPages: PagePlan[] = [];
  let remaining = [...indexEntries];
  let first = true;
  while (first || remaining.length) {
    const room = first ? firstRoom : laterRoom;
    indexPages.push({ kind: "index", entries: remaining.slice(0, room), first });
    remaining = remaining.slice(room);
    first = false;
  }

  pages.push(...indexPages, ...findingPages, ...answerPages, ...photoPages);

  // Resolve index page numbers now that the order is fixed.
  const pageOf = new Map<string, number>();
  pages.forEach((page, index) => {
    const number = index + 1;
    if (page.kind === "findings" && !pageOf.has("findings")) pageOf.set("findings", number);
    if (page.kind === "answers" && !pageOf.has("answers")) pageOf.set("answers", number);
    if (page.kind === "photo") pageOf.set(`photo:${page.photo.media_id}`, number);
  });
  for (const page of indexPages) {
    if (page.kind !== "index") continue;
    for (const entry of page.entries) entry.page = pageOf.get(entry.target);
  }
  return pages;
}

export interface AppendixRenderResult {
  bytes: Buffer;
  pageCount: number;
  renderedPhotoIds: string[];
  placeholderPhotoIds: string[];
}

export async function renderEvidenceAppendixPdf(vm: AppendixViewModel): Promise<AppendixRenderResult> {
  const c = await ReportCanvas.create({ title: `PerfectPPI photo evidence appendix ${vm.report_ref}`.trim(), subject: "Photo evidence appendix" });
  const pages = plan(c, vm);
  const total = pages.length;
  const rendered: string[] = [];
  const placeholders: string[] = [];
  const width = c.W - 2 * c.M;

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    c.addPage();
    if (page.kind === "index") {
      header(c, vm, "Contents and inclusion index");
      let y = 171;
      if (page.first) {
        const summary = [
          ["Scope", vm.scope_label],
          ["Certification", vm.certification_line],
          ["Appendix generated", vm.generated_line],
          ["Findings included", String(vm.findings.length)],
          ["Photos included", `${vm.photos.filter((photo) => photo.image).length} of ${vm.photos.length}${vm.photos.some((photo) => !photo.image) ? " (unavailable photos are listed with placeholders)" : ""}`],
          ["Other evidence", vm.other_media.length ? `${vm.other_media.length} non-photo upload(s), listed below` : "None"],
        ];
        for (const [label, value] of summary) {
          c.text(label.toUpperCase(), c.M, y, { size: 6.8, bold: true, color: c.C.muted });
          const lines = c.wrap(value, width - 130, 9);
          lines.slice(0, 2).forEach((line, lineIndex) => c.text(line, c.M + 130, y - 1 + lineIndex * 11, { size: 9 }));
          y += lines.length > 1 ? 24 : 16;
        }
        y = 171 + 150 - 12;
        c.text("EVIDENCE INDEX", c.M, y, { size: 7.7, bold: true, color: c.C.navy });
        y += 14;
      }
      for (const entry of page.entries) {
        const pageLabel = entry.page ? `p. ${entry.page}` : "index only";
        const labelWidth = width - 60;
        const label = c.fits(entry.label, 8.4, labelWidth) ? entry.label : `${c.wrap(entry.label, labelWidth - 10, 8.4)[0]}…`;
        c.text(label, c.M, y, { size: 8.4 });
        c.text(pageLabel, c.W - c.M, y, { size: 8.4, color: c.C.muted, align: "right" });
        y += 12;
      }
    } else if (page.kind === "findings") {
      header(c, vm, "Complete finding record");
      let y = 171;
      if (page.items.length === 0) c.text("No findings were recorded.", c.M, y, { size: 10 });
      for (const item of page.items) {
        c.status(item.status, c.M, y + 2);
        const title = `${item.ref ? `${item.ref} | ` : ""}${item.title}`;
        c.text(c.fits(title, 9.6, width - 20, true) ? title : c.wrap(title, width - 30, 9.6, true)[0], c.M + 14, y, { size: 9.6, bold: true });
        item.lines.forEach((line, lineIndex) => c.text(line, c.M + 14, y + 17 + lineIndex * 12, { size: 9.2 }));
        y += item.lines.length * 12 + 38;
        c.line(c.M, y - 9, c.W - c.M, y - 9);
      }
    } else if (page.kind === "answers") {
      header(c, vm, "Recorded answers and notes (as entered)");
      let y = 171;
      for (const item of page.items) {
        if (item.heading) {
          c.text(item.heading.toUpperCase(), c.M, y + 2, { size: 7.4, bold: true, color: c.C.navy });
          y += 15;
        }
        item.lines.forEach((line, lineIndex) => c.text(line, c.M, y + lineIndex * 10.5, { size: 8.4 }));
        y += item.lines.length * 10.5 + 3;
      }
    } else if (page.kind === "photo") {
      const photo = page.photo;
      header(c, vm, "Photo evidence record");
      const title = `${photo.evidence_id} | ${photo.title}`;
      c.text(c.fits(title, 12, width, true) ? title : `${c.wrap(title, width - 10, 12, true)[0]}…`, c.M, 173, { size: 12, bold: true });
      const association = c.fits(photo.association, 8.5, width) ? photo.association : `${c.wrap(photo.association, width - 10, 8.5)[0]}…`;
      c.text(association, c.M, 194, { size: 8.5, color: c.C.muted });
      const boxY = 214;
      const boxH = 370;
      c.rect(c.M, boxY, width, boxH, { fill: c.C.paper, stroke: c.C.line, radius: 4 });
      if (photo.image) {
        const embedded = await c.doc.embedJpg(photo.image.jpeg);
        const scale = Math.min((width - 20) / embedded.width, (boxH - 20) / embedded.height);
        const drawWidth = embedded.width * scale;
        const drawHeight = embedded.height * scale;
        c.page.drawImage(embedded, {
          x: c.M + (width - drawWidth) / 2,
          y: c.H - boxY - (boxH + drawHeight) / 2,
          width: drawWidth,
          height: drawHeight,
        });
        rendered.push(photo.media_id);
      } else {
        c.text("PHOTO UNAVAILABLE", c.W / 2, boxY + 166, { size: 16, bold: true, color: c.C.muted, align: "center" });
        c.text(photo.unavailable_reason ?? "The upload is recorded but its image could not be retrieved.", c.W / 2, boxY + 193, { size: 10, color: c.C.muted, align: "center", maxWidth: width - 20 });
        placeholders.push(photo.media_id);
      }
      c.text("CAPTION / FINDING CONTEXT", c.M, 602, { size: 8, bold: true, color: c.C.navy });
      page.captionLines.forEach((line, lineIndex) => c.text(line, c.M, 620 + lineIndex * 13, { size: 9.5 }));
    } else {
      header(c, vm, "Photo evidence record");
      c.text(`${page.photo.evidence_id} - caption continued`, c.M, 172, { size: 11, bold: true });
      page.lines.forEach((line, lineIndex) => c.text(line, c.M, 202 + lineIndex * 13, { size: 9.5 }));
    }
    footer(c, vm, index + 1, total);
  }

  return {
    bytes: await c.save(),
    pageCount: c.doc.getPageCount(),
    renderedPhotoIds: rendered,
    placeholderPhotoIds: placeholders,
  };
}
