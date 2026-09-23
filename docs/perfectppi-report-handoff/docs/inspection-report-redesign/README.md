# PerfectPPI report redesign package

Created September 22, 2026 against repository baseline `019fa14`, after pulling GitHub and incorporating the user's clarification answers.

Start with the [developer handoff](05-developer-handoff.md) and the [exact field map and rules](06-field-map-and-rules.md). They are the implementation specification. The PDF files are reference designs, not live application outputs. No production code, database, migration, deployment, or API credentials were changed.

## Decisions included

- Separate matching Complete Inspection and Dents & Tires visual layouts.
- Exactly two pages in the main report: visual inspection, then category overview.
- No dollar valuation or repair-cost estimates, and no visible AI label on the PDF.
- Tread required at all four corners; self-inspectors can explicitly mark unavailable with a reason. Technician pressure is required under the accepted recommendation; self-inspectors can mark it unavailable. Measured brake/battery tests remain optional.
- Confirmed puncture or embedded foreign object always requires replacement under the chosen program rule, regardless of pressure retention. This does not change warranty benefits.
- The **Include photo evidence appendix** option is unchecked by default. Selecting it creates a separate, unlimited-page PDF containing full findings and every uploaded photo. It does not enlarge the two-page main report.
- Confirmed facts, an accuracy certification, immutable revisions, evidence provenance, and deterministic safety rules underpin the report. Jev handles bounded semantic classification; image extraction and prose generation remain separate.

## PDF files

| File | Pages | Use |
| --- | ---: | --- |
| [Complete visual template](../../output/pdf/perfectppi-complete-visual-template.pdf) | 1 | Reusable blank page 1 |
| [Dents & Tires visual template](../../output/pdf/perfectppi-dents-tires-visual-template.pdf) | 1 | Reusable blank page 1 |
| [Overview template](../../output/pdf/perfectppi-overview-template.pdf) | 1 | Reusable page 2 layout, shown with Complete category labels; the renderer swaps labels for Dents & Tires |
| [Complete filled example](../../output/pdf/perfectppi-complete-example.pdf) | 2 | Fictional technician inspection with puncture, cracking, body damage and partial checks |
| [Dents & Tires filled example](../../output/pdf/perfectppi-dents-tires-example.pdf) | 2 | Fictional self-inspection with unavailable rear-left tread/pressure |
| [Photo evidence appendix example](../../output/pdf/perfectppi-photo-evidence-appendix-example.pdf) | 6 | Full fixture findings and three explicitly labeled photo-placement examples |

The blank templates are static design/reference PDFs for automatic generation, not interactive Acrobat forms. The Python source is the editable master. There were no real vehicle-inspection photos in this request, so the appendix uses honest placement placeholders. It does not pretend the supplied example inspection form is vehicle evidence. The renderer's real-image path was tested separately using that supplied image in a temporary test PDF, which is not included in the deliverables.

## Documents

| Document | Contents |
| --- | --- |
| [01 - Updated plan](01-discovery-and-plan.md) | Cleaned-up request, approved decisions, design and research summary |
| [02 - Flow audit](02-inspection-flow-audit.md) | Source-anchored web/iOS capture audit, original questions and 25-row mapping |
| [03 - Pipeline audit](03-report-pipeline-audit.md) | Existing Gemini/worker/PDF/storage/partner/warranty contracts and change points |
| [04 - Research notes](04-research-notes.md) | Primary-source workflow and tire research; initial recommendations are superseded where the user chose a different product rule |
| [05 - Developer handoff](05-developer-handoff.md) | File-by-file implementation, data contracts, Jev integration, certification, jobs, appendix, compatibility, rollout and acceptance criteria |
| [06 - Field map and rules](06-field-map-and-rules.md) | All 67 Complete and 11 Dents & Tires original prompts, new semantic keys, per-role requirements, action rules and report destinations |
| [07 - Verification record](07-rendering-verification.md) | Artifact checks performed and explicit limits of verification |

## Rebuild the reference artifacts

Use Python 3.12 or a compatible Python environment. Dependencies are pinned to the versions used for this package in [requirements.txt](template-source/requirements.txt). Installing into an isolated virtual environment is recommended.

```bash
python3 -m venv /tmp/ppi-report-reference-venv
/tmp/ppi-report-reference-venv/bin/python -m pip install -r docs/inspection-report-redesign/template-source/requirements.txt
/tmp/ppi-report-reference-venv/bin/python docs/inspection-report-redesign/template-source/render_reports.py
/tmp/ppi-report-reference-venv/bin/python docs/inspection-report-redesign/template-source/verify_reports.py
```

Run from the repository/package root. `render_reports.py --output-dir PATH` writes the six PDFs elsewhere if desired. `verify_reports.py --image-fixture PATH` additionally checks embedding a supplied local supported raster image into a temporary appendix PDF.

Use Poppler to render for visual review:

```bash
pdftoppm -r 140 -png output/pdf/perfectppi-complete-example.pdf /tmp/ppi-complete-review
```

The reference renderer consumes the two [presentation fixtures](template-source/fixtures/), [layout specification](template-source/layout-spec.json), and bundled licensed Liberation Sans fonts. The original vehicle diagram is drawn as vector geometry in [render_reports.py](template-source/render_reports.py). No network, provider key, source reference image, or production account is required to rebuild the six delivered artifacts.

## Implementing the real system

The deployed target remains the existing Node pipeline. Port the design to `pdf-lib` and implement the canonical facts-to-view-model adapter described in the handoff. Most major geometry and typography are in the JSON specification; migrate remaining detailed offsets from the reference renderer into the shared production layout specification to avoid drift.

The fixture JSON is already formatted for display; it is not the canonical inspection storage schema, a model prompt, or a substitute for validation and rule evaluation. The reference does not implement capture UI, OCR/Jev calls, application authorization, immutable storage, export jobs, full production appendix indexing, or migration logic. Those are specified precisely in the handoff. English/Latin-script reference PDFs were checked; other scripts need font/shaping and layout validation before production support is claimed.

Keep old issued reports intact, guard all submitted-state transitions, retain existing warranty policies and four required partner artifacts, and add the appendix as an independent optional artifact. Use the acceptance matrix before enabling v2 generation.
