#!/usr/bin/env python3
"""Sync the app's string catalog with the strings the compiler extracted.

Xcode's editor does this on its own; from the command line (CI, an audit
build) the `.stringsdata` files that SWIFT_EMIT_LOC_STRINGS emits are the
same source of truth. Every extracted key is added to
PerfectPPI/Resources/Localizable.xcstrings; existing entries — and any
translations in them — are kept. Run after `xcodebuild … build`:

    python3 scripts/sync-string-catalog.py [--derived-data <path>] [--check]

--check exits 1 when the catalog is missing keys (for CI) instead of writing.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "PerfectPPI", "Resources", "Localizable.xcstrings")
DEFAULT_DERIVED = os.path.expanduser("~/Library/Developer/Xcode/DerivedData")


def extracted_keys(derived_data: str) -> dict[str, set[str]]:
    """Table → keys, from every PerfectPPI.build stringsdata file."""
    pattern = os.path.join(derived_data, "**", "PerfectPPI.build", "**", "*.stringsdata")
    tables: dict[str, set[str]] = {}
    for path in glob.glob(pattern, recursive=True):
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        for table, entries in data.get("tables", {}).items():
            bucket = tables.setdefault(table, set())
            for entry in entries:
                key = entry["key"] if isinstance(entry, dict) else entry
                if key:
                    bucket.add(key)
    return tables


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--derived-data", default=DEFAULT_DERIVED)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    tables = extracted_keys(args.derived_data)
    keys = tables.get("Localizable", set())
    if not keys:
        print("no extracted strings found; build the app first (SWIFT_EMIT_LOC_STRINGS=YES)", file=sys.stderr)
        return 2

    with open(CATALOG, encoding="utf-8") as handle:
        catalog = json.load(handle)
    strings = catalog.setdefault("strings", {})
    missing = sorted(key for key in keys if key not in strings)

    if args.check:
        if missing:
            print(f"{len(missing)} extracted strings are not in the catalog:", file=sys.stderr)
            for key in missing[:50]:
                print(f"  {key}", file=sys.stderr)
            return 1
        print(f"catalog covers all {len(keys)} extracted strings")
        return 0

    for key in missing:
        # An entry with no localizations uses the key as the source-language
        # value, exactly as Xcode records a freshly extracted string.
        strings[key] = {}
    catalog["strings"] = dict(sorted(strings.items(), key=lambda item: item[0]))
    with open(CATALOG, "w", encoding="utf-8") as handle:
        json.dump(catalog, handle, ensure_ascii=False, indent=2, sort_keys=False)
        handle.write("\n")
    print(f"added {len(missing)} strings; catalog now holds {len(strings)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
