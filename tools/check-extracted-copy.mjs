import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Review aid for an extraction-only change, comparing the English copy and
// protocol literals to the pre-refactor revision. Not a release/conformance test.
const catalogSource = readFileSync("src/lib/i18n/messages/en-ui.ts", "utf8");
const messages = JSON.parse(catalogSource.slice(catalogSource.indexOf("{"), catalogSource.lastIndexOf("}") + 1));
const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: "\u00a0", middot: "\u00b7", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", copy: "\u00a9", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", rarr: "\u2192" };
function normalize(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name) => name.startsWith("#")
    ? String.fromCodePoint(parseInt(name.slice(name[1]?.toLowerCase() === "x" ? 2 : 1), name[1]?.toLowerCase() === "x" ? 16 : 10))
    : entities[name] ?? match).replace(/\s+/g, " ").trim();
}
function tokens(source) {
  const ast = ts.createSourceFile("copy.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const values = [];
  const add = (text) => { const value = normalize(text); if (value) values.push(value); };
  function visit(node) {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isCallExpression(node) && ["uiText", "t"].includes(node.expression.getText(ast)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && messages[node.arguments[0].text]) {
      const message = messages[node.arguments[0].text];
      if (!message) throw new Error(`Unknown message ${node.arguments[0].text}`);
      add(message.replace(/\{arg\d+\}/g, "${}"));
      if (node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        for (const property of node.arguments[1].properties) if (ts.isPropertyAssignment(property)) visit(property.initializer);
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      add(node.head.text + node.templateSpans.map((span) => "${}" + span.literal.text).join(""));
      for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return values;
}
const revision = process.argv[2] ?? "HEAD";
const sharedCopyModules = ["src/config/site.ts", "src/types/enums.ts", "src/lib/community/post-types.ts", "src/lib/social/group-options.ts", "src/features/social/events-policy.ts", "src/features/technicians/credential-types.ts"];
const files = execFileSync("git", ["diff", "--name-only", revision], { encoding: "utf8" }).trim().split("\n")
  .filter((file) => file.endsWith(".tsx") || sharedCopyModules.includes(file));
let failures = 0;
for (const file of files) {
  const before = tokens(execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8" }));
  const after = tokens(readFileSync(file, "utf8"));
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const first = before.findIndex((value, index) => value !== after[index]);
    console.log(JSON.stringify({ file, before: before.slice(Math.max(0, first - 1), first + 3), after: after.slice(Math.max(0, first - 1), first + 3), oldCount: before.length, newCount: after.length }));
    failures += 1;
  }
}
console.log(`English/protocol literal parity: ${files.length - failures}/${files.length} files.`);
process.exitCode = failures ? 1 : 0;
