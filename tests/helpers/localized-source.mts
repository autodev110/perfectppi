import ts from "typescript";
import { en } from "../../src/lib/i18n/messages/en.ts";

/** Resolve only messages used by this source, retaining markup and structural assertions. */
export function resolveSourceCopy(source: string): string {
  const ast = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: { start: number; end: number; text: string }[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "uiText"
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text;
      if (!(key in en)) throw new Error(`Missing UI message: ${key}`);
      const value = en[key as keyof typeof en];
      const parent = node.parent;
      if (ts.isJsxExpression(parent) && parent.expression === node) {
        edits.push({ start: parent.getStart(ast), end: parent.end,
          text: ts.isJsxAttribute(parent.parent) ? JSON.stringify(value) : value });
      } else {
        edits.push({ start: node.getStart(ast), end: node.end, text: JSON.stringify(value) });
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

/** Whitespace-insensitive JSX/attribute copy for the immutable accepted Terms snapshot. */
export function sourceCopyTokens(source: string): string[] {
  const ast = ts.createSourceFile("source.tsx", resolveSourceCopy(source), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tokens: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/&(?:apos|quot|amp|lt|gt);/g, (entity) =>
        ({ "&apos;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">" })[entity]!)
        .replace(/\s+/g, " ").trim();
      if (text) tokens.push(text);
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) tokens.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return tokens;
}
