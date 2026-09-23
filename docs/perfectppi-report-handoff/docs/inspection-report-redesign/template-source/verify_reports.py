#!/usr/bin/env python3
"""Meaningful artifact checks; these do not test the unimplemented application."""
import argparse
import copy
import json
import re
import tempfile
from pathlib import Path

import pdfplumber
from pypdf import PdfReader
import render_reports as rr


def normalized(s):
    return re.sub(r"\s+", " ", s).strip()


def verify(out, image_fixture=None):
    expected={
        "perfectppi-complete-visual-template.pdf":1,
        "perfectppi-dents-tires-visual-template.pdf":1,
        "perfectppi-overview-template.pdf":1,
        "perfectppi-complete-example.pdf":2,
        "perfectppi-dents-tires-example.pdf":2,
        "perfectppi-photo-evidence-appendix-example.pdf":6,
    }
    for name,count in expected.items():
        path=out/name
        reader=PdfReader(path)
        assert len(reader.pages)==count,(name,len(reader.pages))
        assert all(float(p.mediabox.width)==612 and float(p.mediabox.height)==792 for p in reader.pages)
        texts=[p.extract_text() or "" for p in reader.pages]
        text="\n".join(texts)
        assert "AI-generated" not in text and "AI Generated" not in text and "AI analysis" not in text
        assert "MADE IN THE U.S.A." not in text and "ITEM #72970" not in text
        for i,t in enumerate(texts):
            assert f"{i+1} / {count}" in t,(name,"page number",i)
        with pdfplumber.open(path) as pdf:
            for i,p in enumerate(pdf.pages):
                assert all(ch["x0"]>=20 and ch["x1"]<=592 and ch["top"]>=20 and ch["bottom"]<=778 for ch in p.chars),(name,"text outside margins",i)
        print(f"PASS {name}: {count} Letter page(s), text bounds and required labels")

    complete=json.loads((rr.HERE/"fixtures/complete.json").read_text())
    dents=json.loads((rr.HERE/"fixtures/dents_tires.json").read_text())
    first=PdfReader(out/"perfectppi-dents-tires-example.pdf").pages[0].extract_text()
    assert first.count("Unavailable")==2
    assert "0224" in first and "0519" in first
    for _,label in rr.CORNERS: assert label in first
    full=normalized(" ".join(p.extract_text() for p in PdfReader(out/"perfectppi-photo-evidence-appendix-example.pdf").pages))
    for f in complete["full_findings"]:
        assert normalized(f["title"]) in full,f["title"]
        assert normalized(f["text"]) in full,f["title"]
    for p in complete["photos"]:
        assert p["id"] in full
        assert normalized(p["caption"]) in full
    print("PASS fixture fidelity: corners, leading-zero DOT, unavailable readings, all findings/captions")

    with tempfile.TemporaryDirectory(prefix="ppi-pdf-check-") as temp:
        tmp=Path(temp)
        # No fixed appendix page cap; every uploaded-image manifest item is kept.
        many=copy.deepcopy(complete)
        many['full_findings']=[]
        many['photos']=[{**complete['photos'][0],"id":f"PHOTO-{i:03d}"} for i in range(40)]
        rr.pdf_file(tmp/'many.pdf',lambda c:rr.appendix(c,many))
        r=PdfReader(tmp/'many.pdf')
        assert len(r.pages)==41
        text=" ".join(p.extract_text() for p in r.pages)
        assert all(f"PHOTO-{i:03d}" in text for i in range(40))
        # Long captions paginate completely and retain the final unique word.
        long=copy.deepcopy(complete); long['full_findings']=[]; long['photos']=long['photos'][:1]
        long['photos'][0]['caption']="Detailed observation "*1500+"CAPTION-END-SENTINEL"
        rr.pdf_file(tmp/'long.pdf',lambda c:rr.appendix(c,long))
        assert 'CAPTION-END-SENTINEL' in " ".join(p.extract_text() for p in PdfReader(tmp/'long.pdf').pages)
        # Missing checklist facts must not become green.
        missing=copy.deepcopy(complete); missing['checks']={}
        rr.pdf_file(tmp/'unknown.pdf',lambda c:rr.visual(c,missing))
        text=PdfReader(tmp/'unknown.pdf').pages[0].extract_text()
        assert text.count('Unknown')>=25
        # Fixed-page overflow is explicit, rather than unreported truncation.
        too_long=copy.deepcopy(complete); too_long['overview'][0]['observation']='Long text '*300
        try:
            rr.pdf_file(tmp/'overflow.pdf',lambda c:rr.overview(c,too_long))
        except ValueError as error:
            assert 'overflow' in str(error)
        else:
            raise AssertionError('Expected fixed-page overflow rejection')
        if image_fixture:
            real=copy.deepcopy(complete); real['full_findings']=[]; real['photos']=real['photos'][:1]
            real['photos'][0]['path']=str(image_fixture.resolve())
            rr.pdf_file(tmp/'image.pdf',lambda c:rr.appendix(c,real))
            page=PdfReader(tmp/'image.pdf').pages[1]
            assert len(page.images)==1
            assert 'PHOTO PLACEMENT EXAMPLE' not in page.extract_text()
            print("PASS supplied local image embeds without placeholder")
        print("PASS 40-photo pagination, long-caption retention, missing-data behavior and overflow rejection")


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir',type=Path,default=rr.HERE.parents[2]/'output/pdf')
    parser.add_argument('--image-fixture',type=Path)
    args=parser.parse_args()
    verify(args.output_dir,args.image_fixture)
