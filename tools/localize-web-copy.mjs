import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// A conservative resource-extraction codemod. Technical strings (routes,
// CSS, enum codes, imports, protocol values) are never translation inputs.
const root = process.cwd();
const write = process.argv.includes("--write");
const copyAttributes = new Set(["title", "description", "message", "label", "placeholder", "alt", "aria-label", "aria-description", "emptyTitle", "emptyMessage"]);
const technicalProperties = new Set(["className", "href", "src", "method", "type", "kind", "template", "@type", "@context", "id", "name", "value", "key", "variant", "size", "status", "entity", "entityType", "eventName", "surface", "contentType", "reasonCode", "code", "action", "target", "rel", "accept", "htmlFor", "role", "data-state"]);
const copyProperties = new Set(["title", "description", "message", "label", "placeholder", "alt", "error", "subtitle", "heading", "body", "text"]);
for (const property of ["icon", "url", "path", "bucket", "currency", "permission", "capability", "provider", "operation", "operationCode"]) technicalProperties.add(property);
const entityMap = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: "\u00a0", middot: "\u00b7", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", copy: "\u00a9", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", rarr: "\u2192" };
const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) => {
  if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(entity[1]?.toLowerCase() === "x" ? 2 : 1), entity[1]?.toLowerCase() === "x" ? 16 : 10));
  return entityMap[entity] ?? match;
});
function jsxText(text) {
  const lines = text.replace(/\t/g, " ").split(/\r?\n/);
  const last = lines.findLastIndex((line) => /[^ ]/.test(line));
  return decode(lines.map((line, index) => {
    let value = index > 0 ? line.replace(/^ +/, "") : line;
    if (index < lines.length - 1) value = value.replace(/ +$/, "");
    return value && index < last ? `${value} ` : value;
  }).join(""));
}
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : full.endsWith(".tsx") ? [full] : [];
  });
}
const catalogFile = path.join(root, "src/lib/i18n/messages/en-ui.ts");
let messages = {};
try {
  const existing = readFileSync(catalogFile, "utf8");
  messages = JSON.parse(existing.slice(existing.indexOf("{") , existing.lastIndexOf("}") + 1));
} catch { /* First extraction. */ }
function resource(text) {
  const slug = text.toLowerCase().replace(/\{\w+\}/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 44) || "text";
  const key = `ui.${slug}_${createHash("sha256").update(text).digest("hex").slice(0, 10)}`;
  messages[key] = text;
  return key;
}
function context(node) {
  for (let parent = node.parent; parent && !ts.isStatement(parent); parent = parent.parent) {
    if (ts.isJsxAttribute(parent)) return { attribute: parent.name.getText(), copy: copyAttributes.has(parent.name.getText()) };
    if (ts.isPropertyAssignment(parent)) {
      const name = parent.name.getText().replace(/^['"]|['"]$/g, "");
      if (technicalProperties.has(name)) return { copy: false };
      if (copyProperties.has(name)) return { copy: true };
      return {};
    }
    if (ts.isCallExpression(parent)) {
      const callee = parent.expression.getText();
      if (/^(console\.|(?:uiText|t|translate|require|import|slot|optionalText)$)|\.(?:eq|in|has|get|set|select|order|from|rpc|includes|startsWith|endsWith|match|replace|split|join|test|querySelector|setAttribute|removeAttribute|addEventListener|removeEventListener|useState|useReducer)$/.test(callee)) return { copy: false };
    }
    if (ts.isElementAccessExpression(parent) || ts.isArrayLiteralExpression(parent)) return {};
    if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) return {};
  }
  return {};
}
function human(text, forced) {
  if (/^[a-z][a-z0-9_]*$/.test(text)) return false;
  if (!text.trim() || !/[A-Za-z]/.test(text) || /^(?:https?:|\/|#|[a-z][a-z0-9_-]*\/)|^[\w.-]+@|^[a-z0-9_-]+\.[a-z0-9_.-]+$/.test(text)) return false;
  if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Content-Type|Cache-Control|Authorization)$/.test(text)) return false;
  if (/\b(?:flex|grid|rounded|text|bg|gap|border|px|py|font|items|justify|space)-[\w/\[\].-]+/.test(text)) return false;
  return forced || /[A-Za-z][,.:!?]?\s+[A-Za-z]/.test(text) || /^\d+[\d.,]*\s+[A-Za-z]/.test(text) || /^[A-Z][a-z]+(?:[ /&-]+[A-Za-z]+)*$/.test(text) || /^(?:VIN|PDF|FAQ|OBD|DTC|AWD|FWD|RWD)$/.test(text) || (/\{arg\d+\}/.test(text) && /[A-Z][a-z]+/.test(text));
}
let changed = 0;
let extracted = 0;
const sharedCopyModules = ["src/config/site.ts", "src/types/enums.ts", "src/lib/community/post-types.ts", "src/lib/social/group-options.ts", "src/features/social/events-policy.ts", "src/features/technicians/credential-types.ts"];
for (const file of [...walk(path.join(root, "src/app")), ...walk(path.join(root, "src/components")), ...sharedCopyModules.map((file) => path.join(root, file))]) {
  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = jsxText(node.text);
      if (text.trim() && /[A-Za-z]/.test(text)) edits.push({ start: node.pos, end: node.end, text: `{uiText(${JSON.stringify(resource(text))})}` });
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isExpressionStatement(parent)
        || (ts.isPropertyAssignment(parent) && parent.name === node)
        || (ts.isBinaryExpression(parent) && ![ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.PlusToken].includes(parent.operatorToken.kind))) return;
      const where = context(node);
      if (where.copy === false) return;
      const text = where.attribute ? decode(node.text) : node.text;
      if (human(text, where.copy)) {
        const expression = `uiText(${JSON.stringify(resource(text))})`;
        edits.push({ start: node.getStart(ast), end: node.end, text: ts.isJsxAttribute(parent) ? `{${expression}}` : expression });
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const where = context(node);
      const text = node.head.text + node.templateSpans.map((span, index) => `{arg${index}}${span.literal.text}`).join("");
      if (where.copy !== false && human(text, where.copy)) {
        const params = node.templateSpans.map((span, index) => `arg${index}: String(${span.expression.getText(ast)})`).join(", ");
        edits.push({ start: node.getStart(ast), end: node.end, text: `uiText(${JSON.stringify(resource(text))}, { ${params} })` });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!edits.length) continue;
  extracted += edits.length;
  let output = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  // Keep module-level option data resource-backed too. Existing components
  // with a translator may shadow this shorthand with their request locale.
  const imports = ast.statements.filter(ts.isImportDeclaration);
  const insertion = imports.at(-1)?.end ?? ast.statements.find((statement) => !ts.isExpressionStatement(statement))?.pos ?? 0;
  if (!/import\s*\{[^}]*\bt as uiText\b[^}]*\}/.test(source) && !/\bconst uiText\s*=/.test(source)) {
    const modulePath = file.endsWith(".tsx") ? "@/lib/i18n" : "./" + path.relative(path.dirname(file), path.join(root, "src/lib/i18n/index.ts")).replaceAll(path.sep, "/");
    output = output.slice(0, insertion) + `\nimport { t as uiText } from ${JSON.stringify(modulePath)};\n` + output.slice(insertion);
  }
  if (write) writeFileSync(file, output);
  changed += 1;
}
if (write) {
  const referenced = new Set();
  function collectKeys(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collectKeys(file);
      else if (/\.(ts|tsx)$/.test(file) && file !== catalogFile) {
        for (const match of readFileSync(file, "utf8").matchAll(/["'](ui\.[a-z0-9_.]+)["']/g)) referenced.add(match[1]);
      }
    }
  }
  collectKeys(path.join(root, "src"));
  messages = Object.fromEntries(Object.entries(messages).filter(([key]) => referenced.has(key)));
  writeFileSync(catalogFile, "// Extracted English UI resources. Edit translations here, not screen literals.\nexport const uiEn = " + JSON.stringify(Object.fromEntries(Object.entries(messages).sort(([a], [b]) => a.localeCompare(b))), null, 2) + " as const;\n");
}
console.log(JSON.stringify({ changedFiles: changed, extractedUsages: extracted, catalogMessages: Object.keys(messages).length, write }));
if (process.argv.includes("--check") && changed) process.exitCode = 1;
