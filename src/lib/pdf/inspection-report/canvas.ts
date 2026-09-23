import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

// ============================================================================
// Drawing primitives for the inspection report PDFs.
//
// Coordinates follow layout-spec.json: points from the top-left of the page.
// Text is measured with the embedded fonts before it is drawn; anything that
// would not fit raises LayoutOverflowError instead of being clipped or shrunk
// below the reviewed minimum.
// ============================================================================

export class LayoutOverflowError extends Error {
  readonly region: string;

  constructor(message: string, region: string) {
    super(message);
    this.name = "LayoutOverflowError";
    this.region = region;
  }
}

const ASSET_DIR_CANDIDATES = [
  path.join(process.cwd(), "src/lib/pdf/inspection-report"),
  path.join(process.cwd(), ".next/server/src/lib/pdf/inspection-report"),
];

function assetDir(): string {
  for (const candidate of ASSET_DIR_CANDIDATES) {
    try {
      readFileSync(path.join(candidate, "layout-spec.json"));
      return candidate;
    } catch {
      // try the next location
    }
  }
  throw new Error("Inspection report layout assets are missing from the deployment.");
}

export interface LayoutSpec {
  template_version: string;
  page: { width: number; height: number; margin: number };
  colors: Record<string, string>;
  fonts: { regular: string; bold: string };
  typography: Record<string, number>;
  content_budgets: Record<string, number | string>;
  geometry: {
    [key: string]: unknown;
    metadata_fields: Record<string, { x: number; y: number; width: number }>;
    legend_items_x: number[];
    complete: Record<string, number>;
    dents_tires: Record<string, number>;
    overview: Record<string, number>;
    appendix: Record<string, number>;
  } & Record<string, number | unknown>;
  diagram: {
    panel_markers: Record<string, [number, number]>;
    marker_radius: number;
    marker_collision_step: number;
  };
}

let cachedAssets: { spec: LayoutSpec; regular: Uint8Array; bold: Uint8Array } | null = null;

export function loadLayoutAssets() {
  if (cachedAssets) return cachedAssets;
  const dir = assetDir();
  const spec = JSON.parse(readFileSync(path.join(dir, "layout-spec.json"), "utf8")) as LayoutSpec;
  cachedAssets = {
    spec,
    regular: new Uint8Array(readFileSync(path.join(dir, spec.fonts.regular))),
    bold: new Uint8Array(readFileSync(path.join(dir, spec.fonts.bold))),
  };
  return cachedAssets;
}

export function hexColor(hex: string): RGB {
  const value = parseInt(hex, 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

export type StatusName =
  | "checked"
  | "monitor"
  | "service"
  | "urgent"
  | "unknown"
  | "not_inspected"
  | "not_applicable"
  | "outside_scope"
  | "unavailable";

export interface TextOptions {
  size: number;
  bold?: boolean;
  color?: RGB;
  maxWidth?: number;
  align?: "left" | "right" | "center";
}

export class ReportCanvas {
  readonly W: number;
  readonly H: number;
  readonly M: number;
  readonly C: Record<string, RGB>;
  page!: PDFPage;
  readonly doc: PDFDocument;
  readonly spec: LayoutSpec;
  readonly regular: PDFFont;
  readonly bold: PDFFont;

  private constructor(doc: PDFDocument, spec: LayoutSpec, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.spec = spec;
    this.regular = regular;
    this.bold = bold;
    this.W = spec.page.width;
    this.H = spec.page.height;
    this.M = spec.page.margin;
    this.C = Object.fromEntries(Object.entries(spec.colors).map(([key, value]) => [key, hexColor(value)]));
  }

  static async create(meta: { title: string; subject: string }): Promise<ReportCanvas> {
    const assets = loadLayoutAssets();
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(assets.regular, { subset: true });
    const bold = await doc.embedFont(assets.bold, { subset: true });
    doc.setTitle(meta.title);
    doc.setSubject(meta.subject);
    doc.setAuthor("PerfectPPI");
    doc.setCreator("PerfectPPI");
    doc.setProducer("PerfectPPI");
    // Fixed dates keep repeated renders of the same inputs byte-stable.
    const epoch = new Date("2000-01-01T00:00:00Z");
    doc.setCreationDate(epoch);
    doc.setModificationDate(epoch);
    return new ReportCanvas(doc, assets.spec, regular, bold);
  }

  addPage() {
    this.page = this.doc.addPage([this.W, this.H]);
    return this.page;
  }

  font(bold?: boolean) {
    return bold ? this.bold : this.regular;
  }

  width(text: string, size: number, bold?: boolean) {
    return this.font(bold).widthOfTextAtSize(text, size);
  }

  /** Characters the embedded font cannot encode are replaced, never dropped. */
  safe(text: string, bold?: boolean): string {
    const font = this.font(bold);
    const supported = new Set(font.getCharacterSet());
    return Array.from(text.replace(/\s+/g, " ")).map((char) => (supported.has(char.codePointAt(0)!) ? char : "?")).join("");
  }

  statusColor(status: StatusName | string) {
    return this.C[status] ?? this.C.unknown;
  }

  rect(x: number, y: number, w: number, h: number, opts: { fill?: RGB; stroke?: RGB; radius?: number; strokeWidth?: number } = {}) {
    const { fill, stroke, radius = 0, strokeWidth = 0.6 } = opts;
    if (radius > 0) {
      const r = Math.min(radius, w / 2, h / 2);
      // SVG path in top-left coordinates relative to (x, y).
      const d = [
        `M ${r} 0`,
        `H ${w - r}`,
        `Q ${w} 0 ${w} ${r}`,
        `V ${h - r}`,
        `Q ${w} ${h} ${w - r} ${h}`,
        `H ${r}`,
        `Q 0 ${h} 0 ${h - r}`,
        `V ${r}`,
        `Q 0 0 ${r} 0`,
        "Z",
      ].join(" ");
      this.page.drawSvgPath(d, {
        x,
        y: this.H - y,
        color: fill,
        borderColor: stroke,
        borderWidth: stroke ? strokeWidth : 0,
      });
      return;
    }
    this.page.drawRectangle({
      x,
      y: this.H - y - h,
      width: w,
      height: h,
      color: fill,
      borderColor: stroke,
      borderWidth: stroke ? strokeWidth : 0,
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, color?: RGB, width = 0.6) {
    this.page.drawLine({
      start: { x: x1, y: this.H - y1 },
      end: { x: x2, y: this.H - y2 },
      thickness: width,
      color: color ?? this.C.line,
    });
  }

  circle(cx: number, cy: number, r: number, opts: { fill?: RGB; stroke?: RGB; strokeWidth?: number }) {
    this.page.drawCircle({
      x: cx,
      y: this.H - cy,
      size: r,
      color: opts.fill,
      borderColor: opts.stroke,
      borderWidth: opts.stroke ? opts.strokeWidth ?? 0.9 : 0,
    });
  }

  /** Single line; `y` is the top of the text box. Raises when it cannot fit. */
  text(value: string, x: number, y: number, opts: TextOptions) {
    const text = this.safe(String(value), opts.bold);
    const width = this.width(text, opts.size, opts.bold);
    if (opts.maxWidth !== undefined && width > opts.maxWidth + 0.2) {
      throw new LayoutOverflowError(`Line overflow (${width.toFixed(1)} > ${opts.maxWidth}): ${text}`, "line");
    }
    const drawX = opts.align === "right" ? x - width : opts.align === "center" ? x - width / 2 : x;
    this.page.drawText(text, {
      x: drawX,
      y: this.H - y - opts.size * (this.spec.typography.ascent_ratio ?? 0.82),
      size: opts.size,
      font: this.font(opts.bold),
      color: opts.color ?? this.C.ink,
    });
    return width;
  }

  fits(value: string, size: number, maxWidth: number, bold?: boolean) {
    return this.width(this.safe(value, bold), size, bold) <= maxWidth + 0.2;
  }

  /** Largest size from `sizes` at which the line fits, else null. */
  fitSize(value: string, sizes: number[], maxWidth: number, bold?: boolean): number | null {
    for (const size of sizes) if (this.fits(value, size, maxWidth, bold)) return size;
    return null;
  }

  /** Word-wraps with measured widths. Words longer than a line are split. */
  wrap(value: string, width: number, size: number, bold?: boolean): string[] {
    const text = this.safe(String(value), bold).trim();
    if (!text) return [];
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let current = "";
      for (const rawWord of paragraph.split(" ")) {
        let word = rawWord;
        while (this.width(word, size, bold) > width) {
          // Hard-split a token (VIN, URL) that is wider than the line.
          let cut = word.length - 1;
          while (cut > 1 && this.width(word.slice(0, cut), size, bold) > width) cut -= 1;
          if (current) {
            lines.push(current);
            current = "";
          }
          lines.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        const trial = current ? `${current} ${word}` : word;
        if (this.width(trial, size, bold) <= width) {
          current = trial;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  paragraphHeight(value: string, width: number, size: number, leading: number, bold?: boolean) {
    return this.wrap(value, width, size, bold).length * leading;
  }

  /** Draws a wrapped paragraph within a fixed box; raises instead of clipping. */
  paragraph(
    value: string,
    x: number,
    y: number,
    width: number,
    maxHeight: number,
    opts: { size: number; leading?: number; bold?: boolean; color?: RGB; region?: string },
  ): number {
    const leading = opts.leading ?? opts.size * 1.25;
    const lines = this.wrap(value, width, opts.size, opts.bold);
    const used = lines.length * leading;
    if (used > maxHeight + 0.1) {
      throw new LayoutOverflowError(
        `Paragraph overflow (${used.toFixed(1)} > ${maxHeight}) in ${opts.region ?? "text"}: ${value}`,
        opts.region ?? "text",
      );
    }
    const ascent = opts.size * (this.spec.typography.paragraph_ascent_ratio ?? 0.9);
    lines.forEach((line, index) => {
      this.page.drawText(line, {
        x,
        y: this.H - (y + ascent + index * leading),
        size: opts.size,
        font: this.font(opts.bold),
        color: opts.color ?? this.C.ink,
      });
    });
    return used;
  }

  /** Status symbol + optional label. Symbols differ by shape so grayscale copies stay readable. */
  status(value: StatusName | string, x: number, y: number, opts: { size?: number; label?: string; blank?: boolean } = {}) {
    const size = opts.size ?? 8.3;
    const blank = Boolean(opts.blank);
    const color = blank ? this.C.line : this.statusColor(value);
    const white = this.C.white;
    if (!blank && (value === "monitor" || value === "service")) {
      const d = `M ${3} 0 L ${-0.4} 7 L ${6.4} 7 Z`;
      this.page.drawSvgPath(d, { x, y: this.H - y, color, borderColor: color, borderWidth: 0.9 });
    } else {
      this.circle(x + 3, y + 4, 3, { fill: blank ? white : color, stroke: color, strokeWidth: 0.9 });
    }
    if (!blank) {
      if (value === "checked") {
        this.line(x + 1.2, y + 4, x + 2.6, y + 5.3, white, 0.8);
        this.line(x + 2.6, y + 5.3, x + 4.8, y + 2.9, white, 0.8);
      } else if (value === "monitor" || value === "service" || value === "urgent") {
        this.text("!", x + 3, y + 0.6, { size: 6.2, bold: true, color: white, align: "center" });
      } else if (value === "unknown") {
        this.text("?", x + 3, y + 0.6, { size: 6.2, bold: true, color: white, align: "center" });
      } else {
        this.line(x + 1.5, y + 4, x + 4.5, y + 4, white, 0.9);
      }
    }
    if (opts.label !== undefined) {
      this.text(opts.label, x + 11, y - 0.1, { size, color: blank ? this.C.muted : color });
    }
  }

  link(url: string, x: number, y: number, w: number, h: number) {
    const annotation = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, this.H - y - h, x + w, this.H - y],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    const ref = this.doc.context.register(annotation);
    this.page.node.addAnnot(ref);
    void PDFName;
  }

  async save(): Promise<Buffer> {
    const bytes = await this.doc.save({ useObjectStreams: true });
    return Buffer.from(bytes);
  }
}
