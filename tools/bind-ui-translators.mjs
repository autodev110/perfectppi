import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : file.endsWith(".tsx") ? [file] : [];
  });
}
let changed = 0;
for (const file of [...walk("src/app"), ...walk("src/components")]) {
  let source = readFileSync(file, "utf8");
  if (!source.includes('t as uiText')) continue;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const client = ast.statements.some((node) => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === "use client");
  const functions = [];
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "uiText") calls.push(node);
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const name = node.name?.getText(ast) ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(ast) : "");
      const async = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
      if (node.body && ts.isBlock(node.body) && !/\bconst uiText\s*=/.test(node.body.getText(ast))
        && (client ? !async && /^(?:[A-Z]|use[A-Z])/.test(name) : file.startsWith("src/app/") && async && /^(?:[A-Z]|generateMetadata$)/.test(name))) functions.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const selected = functions.filter((fn) => calls.some((call) => call.pos > fn.body.pos && call.end < fn.body.end));
  if (!selected.length) continue;
  const edits = selected.map((fn) => ({ start: fn.body.getStart(ast) + 1, end: fn.body.getStart(ast) + 1,
    text: `\n  const uiText = ${client ? "useTranslator()" : "await getRequestTranslator()"};` }));
  const imports = ast.statements.filter(ts.isImportDeclaration);
  const helper = client ? "useTranslator" : "getRequestTranslator";
  const moduleName = client ? "client" : "server";
  if (!imports.some((node) => node.importClause?.namedBindings?.getText(ast).includes(helper))) {
    const insertion = imports.at(-1).end;
    edits.push({ start: insertion, end: insertion, text: `\nimport { ${helper} } from "@/lib/i18n/${moduleName}";\n` });
  }
  if (calls.every((call) => selected.some((fn) => call.pos > fn.body.pos && call.end < fn.body.end))) {
    const fallback = imports.find((node) => node.getText(ast).includes("t as uiText"));
    edits.push({ start: fallback.getStart(ast), end: fallback.end, text: "" });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  writeFileSync(file, source);
  changed += 1;
}
console.log(`Bound component translators in ${changed} files.`);
