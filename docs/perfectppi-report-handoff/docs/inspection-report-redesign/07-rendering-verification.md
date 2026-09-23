# Reference artifact verification

Date: September 22, 2026. Applies to the supplied reference renderer and fixtures, not the unimplemented production redesign.

## Checks performed

- Generated all six PDFs from the delivered source and JSON fixtures using ReportLab 4.4.9, pypdf 6.10.0 and pdfplumber 0.11.9.
- Confirmed page counts: three one-page templates, two two-page filled examples, and a separate six-page appendix example. All pages are US Letter, 612 × 792 points.
- Rendered every delivered page with Poppler and visually inspected the pages for alignment, clipping, overlap, character rendering, status indicators, metadata, page numbering and certification placement.
- Inspected the Complete visual page in grayscale; text labels and status symbols preserve the meaning of the color indicators.
- Verified extracted text stays inside page margins and omits the reference item number, country-of-origin statement and visible AI labels.
- Checked all four corner labels, leading-zero DOT code `0224`, both unavailable readings in the self-inspection example, and every fixture finding and photo caption in the appendix.
- Exercised the appendix with 40 photo-manifest entries: all entries appeared across 41 pages, demonstrating no fixed page cap. These were temporary layout placeholders, not actual vehicle photos.
- Exercised a long caption and confirmed its end sentinel remained in continuation pages; no silent text truncation.
- Exercised missing checklist data: missing observations rendered Unknown, not Checked.
- Exercised overflowing overview text: the reference renderer raised an explicit overflow error instead of clipping or creating a third main page.
- Exercised a real local WebP embedding path using the user's reference image in a temporary test PDF; confirmed an image object was embedded. That test document was discarded and is not represented as inspection evidence.
- Verified local links in the delivery package and retained the bundled font license.

## Reproducible checks

Run [verify_reports.py](template-source/verify_reports.py) after [render_reports.py](template-source/render_reports.py). These are artifact checks: they cover layout bounds, contents, page counts, pagination and failure behavior, not vehicle diagnosis or model accuracy.

## Implementation work still required

Production capture, database invariants, per-role validation, image extraction, Jev classification, authorization, output jobs and the appendix export option are specified in [05](05-developer-handoff.md) and [06](06-field-map-and-rules.md). No provider was called with private inspection data; no production behavior was changed or tested. The sample appendix intentionally uses marked photo placements because no real inspection-photo set was supplied. Its purpose is to demonstrate layout and complete fixture inclusion.

The reference renderer supports local raster inputs and complete caption pagination but is not a production image-normalization, immutable-manifest, index or job system. Production must additionally validate EXIF orientation, supported upload formats, missing/corrupt images, complete raw-answer inclusion, potentially large file sizes, translations and script shaping, parallel jobs, historical compatibility and all app/database tests in the handoff.
