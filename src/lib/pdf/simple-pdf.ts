interface PdfLine {
  text: string;
  fontSize?: number;
  font?: "regular" | "bold";
  gapAfter?: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const DEFAULT_FONT_SIZE = 10;

function sanitize(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "-");
}

function escapePdfText(text: string) {
  return sanitize(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, fontSize: number) {
  const maxChars = Math.max(22, Math.floor(CONTENT_WIDTH / (fontSize * 0.52)));
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function paginate(lines: PdfLine[]) {
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  function pushPage() {
    if (current.length > 0) pages.push(current);
    current = [];
    y = PAGE_HEIGHT - MARGIN;
  }

  for (const line of lines) {
    const fontSize = line.fontSize ?? DEFAULT_FONT_SIZE;
    const wrapped = wrapText(line.text, fontSize);

    for (const text of wrapped) {
      const lineHeight = Math.ceil(fontSize * 1.45);
      if (y - lineHeight < MARGIN) pushPage();
      current.push({ ...line, text });
      y -= lineHeight + (line.gapAfter ?? 0);
    }
  }

  pushPage();
  return pages.length > 0 ? pages : [[{ text: "", fontSize: DEFAULT_FONT_SIZE }]];
}

function renderPage(lines: PdfLine[], pageNumber: number, totalPages: number) {
  const commands: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  for (const line of lines) {
    const fontSize = line.fontSize ?? DEFAULT_FONT_SIZE;
    const font = line.font === "bold" ? "F2" : "F1";
    const lineHeight = Math.ceil(fontSize * 1.45);
    commands.push(`BT /${font} ${fontSize} Tf ${MARGIN} ${y} Td (${escapePdfText(line.text)}) Tj ET`);
    y -= lineHeight + (line.gapAfter ?? 0);
  }

  commands.push(`BT /F1 8 Tf ${MARGIN} 30 Td (PerfectPPI - Page ${pageNumber} of ${totalPages}) Tj ET`);
  return commands.join("\n");
}

export function createSimplePdf(lines: PdfLine[]) {
  const pages = paginate(lines);
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectStart = 5;
  const pageRefs = pages.map((_, index) => `${pageObjectStart + index * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = pageObjectStart + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = renderPage(pageLines, index + 1, pages.length);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index++) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
