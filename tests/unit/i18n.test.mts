import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { resolveSourceCopy } from "../helpers/localized-source.mts";

const { en } = await import("../../src/lib/i18n/messages/en.ts");
const { formatMessage, messageKeys, resolveLocale, t, translate } = await import("../../src/lib/i18n/index.ts");
const { REPORT_REASON_CODES, reportReasonLabels } = await import("../../src/features/moderation/report-reasons.ts");
const { ENFORCEMENT_ACTION_TYPES, enforcementNotice } = await import("../../src/lib/moderation/enforcement-notice.ts");
const { NOTIFICATION_CATEGORIES } = await import("../../src/lib/notifications/routing.ts");
const { SAFETY_TOPIC_CODES, buildSafetyNotice } = await import("../../src/lib/moderation/safety-notice.ts");
const { usernameSchema } = await import("../../src/features/profiles/username.ts");

const root = new URL("../../", import.meta.url).pathname;

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Plan 32.2: user-facing copy in these modules must come from the catalog.
// Reason labels, policy and enforcement wording, moderation notifications,
// safety notices, username rules, notification categories, and the shared
// report / gallery / upload / share controls.
const CATALOG_OWNED_MODULES = [
  "src/features/moderation/outbox-messages.ts",
  "src/features/moderation/report-reasons.ts",
  "src/features/profiles/username.ts",
  "src/lib/moderation/enforcement-notice.ts",
  "src/lib/moderation/safety-notice.ts",
  "src/lib/notifications/routing.ts",
  "src/components/shared/community-report-control.tsx",
  "src/components/shared/extended-report-control.tsx",
  "src/components/shared/listing-gallery.tsx",
  "src/components/shared/photo-upload-slot.tsx",
  "src/components/shared/share-button.tsx",
  "src/config/site.ts",
  "src/types/enums.ts",
  "src/lib/community/post-types.ts",
  "src/lib/social/group-options.ts",
  "src/features/social/events-policy.ts",
  "src/features/technicians/credential-types.ts",
];

function stripNonCopy(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "")
    .replace(/className=\{?["'`][^"'`]*["'`]\}?/g, "")
    .replace(/className=\{cn\([\s\S]*?\)\}/g, "");
}

describe("localization readiness (plan 32.2)", () => {
  test("the English catalog has non-empty messages with well-formed placeholders", () => {
    const keys = messageKeys();
    assert.ok(keys.length > 100);
    for (const key of keys) {
      const value = en[key];
      assert.equal(typeof value, "string", key);
      assert.ok(value.trim().length > 0, `${key} is empty`);
      assert.ok(!/\{[^}]*$/.test(value) && !/^[^{]*\}/.test(value.replace(/\{\w+\}/g, "")), `${key} has an unbalanced placeholder`);
      assert.match(key, /^[a-z0-9_]+(\.[a-z0-9_]+)+$/, `${key} is not a namespaced key`);
    }
  });

  test("formatMessage fills named params and leaves unknown placeholders visible", () => {
    assert.equal(formatMessage("Hello {name}, {count} new", { name: "Sam", count: 3 }), "Hello Sam, 3 new");
    assert.equal(formatMessage("Hello {name}", {}), "Hello {name}");
    assert.equal(translate("en", "upload.uploading", { percent: 42 }), "Uploading 42%");
  });

  test("locale negotiation falls back to English and honours language ranges", () => {
    assert.equal(resolveLocale(null), "en");
    assert.equal(resolveLocale(""), "en");
    assert.equal(resolveLocale("en-GB,en;q=0.9"), "en");
    assert.equal(resolveLocale("fr-FR,fr;q=0.9,en;q=0.5"), "en");
    assert.equal(resolveLocale("de"), "en");
    assert.equal(resolveLocale("*;q=0, en"), "en");
  });

  test("every enumerated backend code has a catalog label", () => {
    const keys = new Set(messageKeys());
    for (const code of REPORT_REASON_CODES) assert.ok(keys.has(`report.reason.${code}` as never), code);
    for (const type of ENFORCEMENT_ACTION_TYPES) assert.ok(keys.has(`enforcement.action.${type}` as never), type);
    for (const kind of ["ban", "suspension", "posting_hold", "media_hold", "reporting_hold", "warning"]) {
      for (const part of ["title", "body", "still_available"]) assert.ok(keys.has(`enforcement.${kind}.${part}` as never), `${kind}.${part}`);
    }
    for (const entity of ["community_post", "community_comment", "profile", "group", "listing", "review", "message", "media", "unknown"]) {
      assert.ok(keys.has(`entity.${entity}` as never), entity);
    }
    for (const category of NOTIFICATION_CATEGORIES) {
      assert.ok(keys.has(`notifications.category.${category}.label` as never), category);
      assert.ok(keys.has(`notifications.category.${category}.description` as never), category);
    }
    for (const topic of SAFETY_TOPIC_CODES) assert.ok(keys.has(`safety.topic.${topic}` as never), topic);
    assert.deepEqual(Object.keys(reportReasonLabels()), [...REPORT_REASON_CODES]);
  });

  test("every static key referenced in src exists in the catalog", () => {
    const keys = new Set<string>(messageKeys());
    const pattern = /\b(?:t|uiText|translate)\((?:[^,()"']+,\s*)?"([a-z0-9_.]+)"/g;
    let seen = 0;
    for (const file of walk(join(root, "src"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(pattern)) {
        seen += 1;
        assert.ok(keys.has(match[1]), `${file.slice(root.length)} references missing key ${match[1]}`);
      }
    }
    assert.ok(seen > 40, "expected catalog usages in src");
  });

  test("screen copy resolves only keys actually referenced, including accessible labels", () => {
    assert.equal(resolveSourceCopy('<button aria-label={uiText("ui.next_media_e7521225cb")}/>'), '<button aria-label="Next media"/>');
    assert.equal(resolveSourceCopy('<span>{uiText("ui.next_media_e7521225cb")}</span>'), '<span>Next media</span>');
    assert.equal(resolveSourceCopy("const status = 'active';"), "const status = 'active';");
    assert.throws(() => resolveSourceCopy('uiText("ui.missing_key")'), /Missing UI message/);
  });

  test("page and control copy stays extracted without translating protocol inputs", () => {
    const check = spawnSync(process.execPath, ["tools/localize-web-copy.mjs", "--check"], { cwd: root, encoding: "utf8" });
    assert.equal(check.status, 0, check.stdout + check.stderr);
    for (const file of walk(join(root, "src"))) {
      const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === "uiText"
          && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text as keyof typeof en;
          const params = [...en[key].matchAll(/\{(arg\d+)\}/g)].map((match) => match[1]);
          if (params.length) {
            const supplied = node.arguments[1];
            assert.ok(supplied && ts.isObjectLiteralExpression(supplied), `${file}: ${key} needs parameters`);
            const names = supplied.properties.map((property) => property.name?.getText(ast));
            for (const name of params) assert.ok(names.includes(name), `${file}: ${key} is missing ${name}`);
          }
          const parent = node.parent;
          if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
            assert.ok(!["get", "set", "has", "eq", "select", "from", "rpc"].includes(parent.expression.name.text),
              `${file}: translated a protocol input to ${parent.expression.name.text}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  });

  test("catalog-owned modules carry no embedded sentences", () => {
    for (const relative of CATALOG_OWNED_MODULES) {
      const source = stripNonCopy(readFileSync(join(root, relative), "utf8"));
      const quoted = source.match(/["'`][^"'`\n]*[A-Za-z]+\s+[A-Za-z]+\s+[A-Za-z]+[^"'`\n]*["'`]/g) ?? [];
      assert.deepEqual(quoted, [], `${relative} embeds copy: ${quoted.join(" | ")}`);
      if (relative.endsWith(".tsx")) {
        const jsxText = source.match(/>[^<>{}\n]*[A-Za-z]+\s+[A-Za-z]+[^<>{}\n]*</g) ?? [];
        assert.deepEqual(jsxText, [], `${relative} embeds JSX copy: ${jsxText.join(" | ")}`);
      }
    }
  });

  test("the iOS app extracts its UI copy into a string catalog", () => {
    const project = readFileSync(join(root, "mobile-app/project.yml"), "utf8");
    assert.match(project, /SWIFT_EMIT_LOC_STRINGS: YES/);
    assert.match(project, /LOCALIZATION_PREFERS_STRING_CATALOGS: YES/);
    assert.match(project, /PerfectPPI\/Resources\/Localizable\.xcstrings/);
    const catalog = JSON.parse(readFileSync(join(root, "mobile-app/PerfectPPI/Resources/Localizable.xcstrings"), "utf8")) as {
      sourceLanguage: string; strings: Record<string, unknown>;
    };
    assert.equal(catalog.sourceLanguage, "en");
    const keys = Object.keys(catalog.strings);
    assert.ok(keys.length > 1000, `catalog holds ${keys.length} strings`);
    // Shared components take LocalizedStringKey so their call sites are extracted.
    const components = readFileSync(join(root, "mobile-app/PerfectPPI/DesignSystem/Components.swift"), "utf8");
    assert.match(components, /struct EmptyStateCard: View \{[\s\S]*?let title: LocalizedStringKey[\s\S]*?let message: LocalizedStringKey/);
    // Report reasons read identically on web and iOS and are both catalog-backed.
    const feed = readFileSync(join(root, "mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift"), "utf8");
    for (const code of REPORT_REASON_CODES) {
      const label = en[`report.reason.${code}` as keyof typeof en];
      assert.ok(feed.includes(`("${code}", String(localized: "${label}"))`), `iOS reason ${code} is not catalog-backed with the web label`);
      assert.ok(label in catalog.strings, `iOS catalog lacks reason label ${label}`);
    }
    // Error copy the app produces itself goes through the catalog too.
    const apiError = readFileSync(join(root, "mobile-app/PerfectPPI/Core/Networking/APIError.swift"), "utf8");
    assert.ok(!/return "[^"]+"/.test(apiError), "APIError returns a raw English literal");
  });

  test("migrated helpers still produce the expected English", () => {
    assert.equal(t("report.reason.spam"), "Spam or misleading content");
    const notice = enforcementNotice([{ id: "a", action_type: "ban", reason_code: "hate", starts_at: "2026-01-01T00:00:00Z", ends_at: null }], new Date("2026-02-01T00:00:00Z"));
    assert.equal(notice?.title, "Your account has been permanently closed");
    assert.match(notice?.body ?? "", /hate or dehumanizing content.*permanently/);
    assert.match(buildSafetyNotice("my brakes squeal and the airbag light is on")?.message ?? "", /brakes and airbags and restraint systems/);
    assert.equal(usernameSchema.safeParse("ab").error?.issues[0]?.message, "Username must be at least 4 characters");
  });
});
