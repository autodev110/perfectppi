#!/usr/bin/env python3
"""Executable PDF design reference. This is not connected to production data.

Inputs are the presentation fixtures beside this file, adapted from the canonical
contracts in 05/06. It deliberately raises on text overflow instead of silently
clipping. All coordinates are points from the top-left, matching layout-spec.json.
"""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

HERE = Path(__file__).resolve().parent
SPEC = json.loads((HERE / "layout-spec.json").read_text())
W, H, M = SPEC["page"]["width"], SPEC["page"]["height"], SPEC["page"]["margin"]
C = {k: colors.HexColor("#" + v) for k, v in SPEC["colors"].items()}
G = SPEC["geometry"]
T = SPEC["typography"]
B = SPEC["content_budgets"]
for name, key in [("PPI", "regular"), ("PPI-Bold", "bold")]:
    pdfmetrics.registerFont(TTFont(name, str(HERE / SPEC["fonts"][key])))

STATUS = {"checked": "Checked", "monitor": "Monitor", "service": "Service", "urgent": "Urgent", "unknown": "Unknown", "not_inspected": "Not inspected", "unavailable": "Unavailable", "not_applicable": "N/A", "outside_scope": "Outside scope", "blank": ""}
CORNERS = [("front_left", "FRONT LEFT"), ("front_right", "FRONT RIGHT"), ("rear_left", "REAR LEFT"), ("rear_right", "REAR RIGHT")]
CHECKLIST = [
    ("IDENTITY & EXTERIOR", [("identity", "Identity / title / history"), ("paint", "Paint / panels / body damage"), ("windshield", "Windshield"), ("lamps", "Exterior lamps / lenses")]),
    ("CABIN & CONTROLS", [("seats", "Seats / upholstery / adjustments"), ("carpet", "Carpet / floor mats"), ("odors", "Interior odors"), ("windows", "Windows / door locks"), ("climate", "Air conditioning / heat"), ("electrical", "Infotainment / other electrical")]),
    ("DRIVE & DIAGNOSTICS", [("starting", "Starting / transmission"), ("braking", "Braking during road test"), ("drivability", "Road vibration / noise"), ("warnings", "Dashboard / warning lamps"), ("diagnostics", "Diagnostic scan findings")]),
    ("ENGINE & FLUIDS", [("leaks", "Engine-bay fluid / coolant leaks"), ("idle", "Idle noise / engine concerns"), ("belt", "Drive belt"), ("battery", "Battery terminals"), ("fluids", "Fluids observed")]),
    ("BRAKES, CHASSIS & OTHER", [("brakes", "Pad estimate / visible rotors"), ("steering", "Steering / tracking"), ("suspension", "Suspension / ride"), ("underbody", "Frame / underside / exhaust"), ("modifications", "Modifications / other concerns")])
]

def ink(status):
    return C[status] if status in C else C["unknown"]

def rect(c, x, y, w, h, fill=None, stroke=None, radius=0):
    c.setFillColor(fill or C["white"])
    c.setStrokeColor(stroke or fill or C["white"])
    c.setLineWidth(.6)
    if radius:
        c.roundRect(x, H-y-h, w, h, radius, stroke=bool(stroke), fill=bool(fill))
    else:
        c.rect(x, H-y-h, w, h, stroke=bool(stroke), fill=bool(fill))

def line(c, x1, y1, x2, y2, color=None, width=.6):
    c.setStrokeColor(color or C["line"])
    c.setLineWidth(width)
    c.line(x1, H-y1, x2, H-y2)

def txt(c, text, x, y, size=9, bold=False, color=None, max_width=None, align="left"):
    text = str(text)
    font = "PPI-Bold" if bold else "PPI"
    width = pdfmetrics.stringWidth(text, font, size)
    if max_width is not None and width > max_width + .2:
        raise ValueError(f"Line overflow ({width:.1f}>{max_width}): {text!r}")
    c.setFont(font, size)
    c.setFillColor(color or C["ink"])
    method = {"left": c.drawString, "right": c.drawRightString, "center": c.drawCentredString}[align]
    method(x, H-y-size*.82, text)

def para(c, text, x, y, w, h, size=9, leading=None, color=None, bold=False):
    style = ParagraphStyle("cell", fontName="PPI-Bold" if bold else "PPI", fontSize=size, leading=leading or size*1.25, textColor=color or C["ink"], spaceAfter=0)
    p = Paragraph(escape(str(text)).replace("\n", "<br/>"), style)
    _, used = p.wrap(w, h)
    if used > h + .1:
        raise ValueError(f"Paragraph overflow ({used:.1f}>{h}) at {x},{y}: {text!r}")
    p.drawOn(c, x, H-y-used)
    return used

def status(c, value, x, y, size=8.3, label=None, blank=False):
    color = ink(value)
    c.setStrokeColor(color if not blank else C["line"])
    c.setFillColor(color if not blank else C["white"])
    c.setLineWidth(.9)
    if not blank and value in ("monitor","service"):
        p=c.beginPath(); p.moveTo(x+3,H-y); p.lineTo(x-.4,H-y-7); p.lineTo(x+6.4,H-y-7); p.close()
        c.drawPath(p,stroke=1,fill=1)
    else:
        c.circle(x+3, H-y-4, 3, stroke=1, fill=not blank)
    if not blank:
        c.setStrokeColor(C["white"])
        if value == "checked":
            c.setLineWidth(.8)
            c.line(x+1.2,H-y-4,x+2.6,H-y-5.3)
            c.line(x+2.6,H-y-5.3,x+4.8,H-y-2.9)
        elif value in ("monitor", "service", "urgent"):
            txt(c,"!",x+3,y+.2,6.6,True,C["white"],align="center")
        elif value == "unknown":
            txt(c,"?",x+3,y+.4,6.6,True,C["white"],align="center")
        else:
            c.line(x+1.5,H-y-4,x+4.5,H-y-4)
    if label is not None:
        txt(c,label,x+11,y-.1,size,color=color if not blank else C["muted"])

def section(c, title, x, y, w, note=None):
    txt(c,title,x,y,T["section_pt"],True,C["navy"])
    if note:
        txt(c,note,x+w,y+.5,7.2,color=C["muted"],align="right")
    line(c,x,y+16,x+w,y+16,C["navy"],.8)

def field(c,label,value,x,y,w,blank=False):
    txt(c,label.upper(),x,y,6.8,True,C["muted"])
    if blank:
        line(c,x,y+20,x+w,y+20)
    else:
        txt(c,value,x,y+10,T["metadata_value_pt"],True,max_width=w)

def header(c,d,title="Visual vehicle inspection report",blank=False):
    txt(c,"PERFECTPPI",M,28,T["brand_pt"],True,C["navy"])
    scope = "COMPLETE INSPECTION" if d["scope"]=="complete" else "DENTS & TIRES"
    sw=pdfmetrics.stringWidth(scope,"PPI-Bold",8)+20
    rect(c,W-M-sw,27,sw,20,C["navy"],radius=3)
    txt(c,scope,W-M-sw/2,33,8,True,C["white"],align="center")
    txt(c,title,M,G["header_title_y"],T["title_pt"],True,C["navy"],max_width=W-2*M)
    subtitle = "Findings at the time of inspection. See the overview for priorities and next steps." if title.startswith("Visual") else "Condition, context and practical next steps, organized by inspection category."
    txt(c,subtitle,M,83,8.7,color=C["muted"])
    rect(c,M,100,W-2*M,68,C["paper"],radius=4)
    field(c,"Vehicle",d.get("vehicle",""),42,109,290,blank)
    field(c,"Report reference",d.get("report_id",""),354,109,216,blank)
    field(c,"VIN",d.get("vin",""),42,140,210,blank)
    field(c,"Odometer",d.get("mileage",""),266,140,95,blank)
    field(c,"Inspection date",d.get("date",""),382,140,188,blank)

def legend(c):
    y=G["legend_y"]
    for x,s,label in [(30,"checked","Checked"),(123,"monitor","Monitor"),(211,"service","Service recommended"),(361,"urgent","Urgent"),(445,"unknown","Unknown / not inspected")]:
        status(c,s,x,y,label=label,size=8.0)
    txt(c,"N/A = not applicable. A missing or unavailable check is never marked as checked.",M,y+15,7.5,color=C["muted"])

def footer(c,d,page,total,blank=False,appendix=False):
    line(c,M,753,W-M,753)
    label="BLANK TEMPLATE" if blank else ("FICTIONAL EXAMPLE - NOT AN INSPECTION RECORD" if d.get("sample") else d["report_id"])
    txt(c,label,M,G["footer_y"],T["footer_pt"],True,C["muted"])
    txt(c,f"{('APPENDIX | ' if appendix else '')}{page} / {total}",W-M,G["footer_y"],7.5,True,C["muted"],align="right")

def certification(c,d,blank=False):
    y=G["certification_y"]
    line(c,M,y-9,W-M,y-9,C["navy"],.8)
    txt(c,"INSPECTOR CERTIFICATION",M,y,7.7,True,C["navy"])
    rect(c,M,y+17,7,7,stroke=C["muted"])
    if not blank and d.get("certified"):
        line(c,M+1.1,y+20.5,M+3,y+22.5,C["navy"],.9)
        line(c,M+3,y+22.5,M+6,y+18.5,C["navy"],.9)
    para(c,"I certify that the observations and answers in this inspection are accurate to the best of my knowledge and ability.",M+14,y+15,538,12,8.2)
    if blank:
        txt(c,"Inspector / role:",M,y+34,8.1,color=C["muted"])
        line(c,106,y+43,330,y+43)
        txt(c,"Date / time:",352,y+34,8.1,color=C["muted"])
        line(c,404,y+43,582,y+43)
    else:
        txt(c,d["inspector"],M,y+34,8.4,True,max_width=305)
        txt(c,d["certification_time"],W-M,y+34,8,color=C["muted"],align="right",max_width=230)

def tire_card(c,t,key,label,x,y,w,h,blank=False,compact=False):
    rect(c,x,y,w,h,C["white"],C["line"],4)
    rect(c,x,y,w,21,C["paper"],radius=4)
    txt(c,label,x+9,y+6,8.1,True,C["navy"])
    if not blank:
        s=t["status"]
        status(c,s,x+w-55,y+6,label=STATUS[s]+("*" if t.get("partial") else ""),size=7.5)
    # Text fields have fixed footprints. Preserve source units and missing states.
    if compact:
        rows=[("Tread",t.get("tread","")),("Pressure",t.get("pressure","")),("Size",t.get("size","")),("Load / speed",t.get("service","")),("DOT",t.get("dot","")),("Cracking",t.get("cracking","")),("Wear",t.get("wear","")),("Tire / rim",t.get("damage_short","")),("Fitment",t.get("fitment",""))]
        yy=y+28
        for lab,val in rows:
            if blank:
                txt(c,lab,x+8,yy,7.2,color=C["muted"])
                line(c,x+64,yy+8,x+w-8,yy+8)
            else:
                # Compact card uses a dedicated second line only for longer metrics.
                text=f"{lab}: {val}"
                txt(c,text,x+8,yy,7.75 if lab=="Tire / rim" else T["compact_measurement_pt"],max_width=w-16)
                if lab in ("Cracking","Wear"):
                    status(c,t.get(lab.lower()+"_status","unknown"),x+w-12,yy)
            yy+=11.6
    else:
        yy=y+31
        for lab,fieldkey in [("Tread","tread"),("Pressure","pressure"),("Tire size","size"),("Load / speed / DOT","identity_short"),("Cracking","cracking"),("Uneven wear","wear"),("Tire / rim damage","damage_short"),("Placard fitment","fitment")]:
            txt(c,lab,x+10,yy,8.2,color=C["muted"])
            if blank:
                line(c,x+113,yy+8,x+w-10,yy+8)
            else:
                txt(c,t.get(fieldkey,""),x+113,yy,8.5,fieldkey=="tread",max_width=w-123)
                if fieldkey in ("cracking","wear"):
                    status(c,t.get(fieldkey+"_status","unknown"),x+w-17,yy)
            yy+=13.5

def car_top(c,x,y,w,h,markers=None):
    """Original simplified vector silhouette, not traced from the reference image."""
    bodyx=x+w*.23; bodyw=w*.54
    rect(c,bodyx,y+5,bodyw,h-10,C["white"],C["muted"],min(12,w*.13))
    # wheels, cabin, windshield and hood/trunk panel seams
    for xx in [x+w*.11,x+w*.78]:
        for yy in [y+h*.19,y+h*.66]:
            rect(c,xx,yy,w*.11,h*.18,C["paper"],C["muted"],2)
    rect(c,x+w*.30,y+h*.32,w*.40,h*.32,C["paper"],C["muted"],4)
    for frac in [.20,.28,.69,.78]:
        line(c,bodyx+3,y+h*frac,bodyx+bodyw-3,y+h*frac,C["line"])
    line(c,x+w*.5,y-4,x+w*.5,y+1,C["muted"])
    txt(c,"FRONT",x+w*.5,y-13,6.5,True,C["muted"],align="center")
    for m in markers or []:
        mx=x+w*m["x"]; my=y+h*m["y"]
        c.setFillColor(ink(m.get("status","monitor")))
        c.circle(mx,H-my,6,stroke=0,fill=1)
        txt(c,m["id"],mx,my-3.5,7,True,C["white"],align="center")

def damage_block(c,d,x,y,w,h,blank=False,wide=False):
    section(c,"BODY DAMAGE MAP",x,y,w)
    mapw=95 if not wide else 110
    car_top(c,x+3,y+39,mapw,h-46,[] if blank else d.get("markers",[]))
    dx=x+mapw+13; dw=w-mapw-13
    if blank:
        txt(c,"MARK / PANEL / OBSERVATION",dx,y+27,6.9,True,C["muted"])
        for i in range(3):
            line(c,dx,y+51+i*22,x+w,y+51+i*22)
    else:
        yy=y+27
        for item in d.get("body",[]):
            if yy+33 > y+h-(17 if wide else 0):
                raise ValueError("Body finding list exceeds page-1 budget; group explicitly and retain full findings.")
            status(c,item["status"],dx,yy,label=f"{item['id']}  {item['panel']}",size=8.0)
            used=para(c,item["text"],dx+11,yy+13,dw-11,B["body_note_height_pt"],8.0,10)
            yy+=max(36,used+19)
    if wide:
        txt(c,"Vehicle left/right is viewed from the driver's seat. Bumpers outside this scope.",dx,y+h-12,7.2,color=C["muted"],max_width=dw)

def visual(c,d,blank=False):
    header(c,d,blank=blank); legend(c)
    scope=d["scope"]
    geom=G[scope]
    if scope=="complete":
        x=M; w=geom["checklist_width"]; y=G["content_top"]
        for heading,rows in CHECKLIST:
            rect(c,x,y,w,16,C["navy"],radius=2)
            txt(c,heading,x+7,y+4,7.6,True,C["white"])
            y+=18
            for key,label in rows:
                r=d.get("checks",{}).get(key,{"status":"unknown","coverage":"not_assessed"})
                s=r.get("status","unknown")
                if not blank: status(c,s,x+2,y+2)
                txt(c,label,x+(3 if blank else 15),y+1,T["checklist_pt"],max_width=w-74)
                if blank:
                    for bx,sk in zip([x+w-45,x+w-32,x+w-19,x+w-6],["checked","monitor","service","urgent"]):
                        c.setStrokeColor(C[sk]); c.circle(bx,H-y-5,2.7,stroke=1,fill=0)
                else:
                    short={"checked":"OK","monitor":"Watch","service":"Service","urgent":"Urgent","unknown":"Unknown","not_applicable":"N/A"}.get(s,"Partial")
                    if r.get("coverage")=="partial": short+="*"
                    txt(c,short,x+w-2,y+1,7.4,True,ink(s),align="right")
                line(c,x,y+12,x+w,y+12)
                y+=13.7
            y+=2
        txt(c,"* Partial: see uninspected items in the overview.",x,y+1,7.2,color=C["muted"])
        xx=geom["right_x"]; ww=geom["right_width"]
        section(c,"TIRES & WHEELS",xx,G["content_top"],ww)
        txt(c,"Placard:",xx,239,7.5,True,C["muted"])
        if blank:
            line(c,xx+39,246,xx+ww,246)
        else:
            txt(c,d["placard_short"],xx+39,239,7.5,max_width=ww-39)
        gap=geom["tire_gap"]; cw=(ww-gap)/2
        for i,(key,label) in enumerate(CORNERS):
            tire_card(c,d.get("tires",{}).get(key,{}),key,label,xx+(i%2)*(cw+gap),geom["tire_y"]+(i//2)*(geom["tire_card_height"]+gap),cw,geom["tire_card_height"],blank,True)
        damage_block(c,d,xx,geom["damage_y"],ww,geom["damage_height"],blank)
    else:
        section(c,"TIRES & WHEELS",M,219,W-2*M,"Four corners. Measured values and visible condition.")
        txt(c,"Placard reference:",M,240,8,True,C["muted"])
        if blank: line(c,M+79,248,W-M,248)
        else: txt(c,d["placard_short"],M+79,240,8,max_width=W-2*M-79)
        gap=geom["tire_gap"]; cw=(W-2*M-gap)/2
        for i,(key,label) in enumerate(CORNERS):
            tire_card(c,d.get("tires",{}).get(key,{}),key,label,M+(i%2)*(cw+gap),geom["tire_y"]+(i//2)*(geom["tire_card_height"]+gap),cw,geom["tire_card_height"],blank)
        if not blank and any(t.get("partial") for t in d.get("tires",{}).values()):
            txt(c,"* Partial: tread or pressure unavailable; see the tire entries and overview.",M,555,7.2,color=C["muted"])
        damage_block(c,d,M,geom["damage_y"],W-2*M,geom["damage_height"],blank,True)
    certification(c,d,blank)
    footer(c,d,1,1 if blank else 2,blank)
    c.showPage()

def overview(c,d,blank=False):
    header(c,d,"Inspection overview",blank)
    txt(c,"OBSERVATIONS  /  SIGNIFICANCE  /  NEXT STEPS",M,187,8.7,True,C["muted"])
    geom=G["overview"]
    y=geom["priority_y"]
    rect(c,M,y,W-2*M,geom["priority_height"],C["paper"],radius=4)
    rect(c,M,y,3,geom["priority_height"],C["navy"] if blank else C["urgent"])
    txt(c,"PRIORITY ACTIONS",M+13,y+11,8.3,True,C["navy"])
    if blank:
        for yy in [y+34,y+49]: line(c,M+13,yy,W-M-13,yy)
    else:
        para(c,d["priority"],M+13,y+27,W-2*M-26,B["priority_height_pt"],10,13)
    gap=geom["column_gap"]; cw=(W-2*M-gap)/2
    cats=d.get("overview",[]) if not blank else [
        {"title":s} for s in ["TIRES & WHEELS","BODY & EXTERIOR","INTERIOR & CONTROLS","ENGINE & FLUIDS","BRAKES & CHASSIS","ROAD TEST & DIAGNOSTICS"]]
    if len(cats)>B["overview_category_count_max"]:
        raise ValueError("Overview exceeds six category blocks; consolidate explicitly, retaining urgent findings.")
    for i,cat in enumerate(cats):
        x=M+(i%2)*(cw+gap); yy=geom["categories_y"]+(i//2)*(geom["category_height"]+geom["row_gap"])
        rect(c,x,yy,cw,geom["category_height"],C["white"],C["line"],4)
        txt(c,cat["title"],x+11,yy+11,8.6,True,C["navy"],max_width=cw-22)
        if blank:
            for k,t in enumerate(["Observation","Significance","Next step"]):
                txt(c,t,x+11,yy+31+k*23,7.5,color=C["muted"])
                line(c,x+76,yy+40+k*23,x+cw-11,yy+40+k*23)
        else:
            para(c,cat["observation"],x+11,yy+29,cw-22,B["overview_observation_height_pt"],T["body_pt"],T["overview_leading_pt"])
            para(c,cat["action"],x+11,yy+72,cw-22,B["overview_action_height_pt"],8.6,10.8,color=ink(cat.get("status","unknown")),bold=True)
    by=675
    line(c,M,by,W-M,by,C["navy"],.8)
    txt(c,"SCOPE & EVIDENCE",M,by+11,8,True,C["navy"])
    if blank:
        for yy in [by+35,by+51]: line(c,M,yy,W-M,yy)
    else:
        para(c,d["limitations"],M,by+27,W-2*M,30,8.6,11)
        if d.get("detail_url"):
            label="View full findings and photo evidence"
            txt(c,label,M,by+62,8.4,True,C["blue"])
            c.linkURL(d["detail_url"],(M,H-by-73,M+220,H-by-59),relative=0)
        else:
            txt(c,"Full findings and uploaded photos are available through the optional evidence appendix.",M,by+62,8.1,color=C["muted"])
    footer(c,d,1 if blank else 2,1 if blank else 2,blank)
    c.showPage()

def appendix_header(c,d,subtitle):
    txt(c,"PERFECTPPI",M,28,16.5,True,C["navy"])
    txt(c,"PHOTO EVIDENCE APPENDIX",W-M,34,8.3,True,C["muted"],align="right")
    txt(c,"Full findings & photo evidence",M,63,21,True,C["navy"])
    txt(c,d["vehicle"],M,95,10,True)
    txt(c,f"{d['report_id']}  |  {d['date']}  |  {d['inspector']}",M,113,8.3,color=C["muted"],max_width=W-2*M)
    txt(c,subtitle,M,138,9,True,C["blue"])
    line(c,M,154,W-M,154,C["navy"],.8)

def append_paragraph_pages(text,width,size=9.5,leading=13,max_height=470):
    """Break arbitrarily long text at word boundaries; no silent truncation."""
    words=str(text).split(); chunks=[]; current=[]
    style=ParagraphStyle("pagination",fontName="PPI",fontSize=size,leading=leading)
    for word in words:
        trial=" ".join(current+[word])
        p=Paragraph(escape(trial),style)
        if p.wrap(width,max_height)[1]>max_height and current:
            chunks.append(" ".join(current)); current=[word]
        else: current.append(word)
    if current or not chunks: chunks.append(" ".join(current))
    return chunks

def appendix(c,d):
    # All findings, including good/unknown results, are retained. Pagination is
    # data-driven; no arbitrary item cap. Real production generation must freeze
    # this list and its entire authorized media manifest before rendering.
    findings=d.get("full_findings",[])
    pages=[]; current=[]; used=0
    for f in findings:
        pieces=append_paragraph_pages(f["text"],W-2*M-30,size=9.2,leading=12,max_height=390)
        for k,piece in enumerate(pieces):
            title=f["title"]+(" (continued)" if k else "")
            st=ParagraphStyle("measure",fontName="PPI",fontSize=9.2,leading=12)
            ph=Paragraph(escape(piece),st).wrap(W-2*M-30,500)[1]
            height=ph+38
            if used+height>560 and current:
                pages.append(("findings",current)); current=[]; used=0
            current.append({**f,"title":title,"text":piece,"height":height}); used+=height
    if current: pages.append(("findings",current))
    if not pages: pages.append(("findings",[]))
    for p in d.get("photos",[]):
        pages.append(("photo",p))
        # Long captions remain complete on continuation pages.
        for chunk in append_paragraph_pages(p.get("caption",""),W-2*M,max_height=70)[1:]:
            pages.append(("caption",{"photo":p,"text":chunk}))
    total=len(pages)
    for i,(kind,items) in enumerate(pages):
        appendix_header(c,d,"Complete finding record" if kind=="findings" else "Photo evidence record")
        if kind=="findings":
            y=171
            if not items: txt(c,"No findings were recorded.",M,y,10)
            for f in items:
                status(c,f["status"],M,y+2)
                txt(c,f["title"],M+14,y,9.6,True,max_width=W-2*M-20)
                para(c,f["text"],M+14,y+17,W-2*M-30,f["height"]-25,9.2,12)
                y+=f["height"]
                line(c,M,y-9,W-M,y-9)
        elif kind=="caption":
            txt(c,items["photo"]["id"]+" - caption continued",M,172,11,True)
            para(c,items["text"],M,202,W-2*M,480,9.5,13)
        else:
            p=items
            txt(c,p["id"]+" | "+p["title"],M,173,12,True,max_width=W-2*M)
            txt(c,p.get("association","Unlinked upload"),M,194,8.5,color=C["muted"],max_width=W-2*M)
            y=214; height=370
            rect(c,M,y,W-2*M,height,C["paper"],C["line"],4)
            path=p.get("path")
            if path:
                path=Path(path)
                if not path.is_absolute(): path=HERE/path
                if path.exists():
                    # Preserve aspect ratio and show the whole photo. Input EXIF
                    # normalization is the caller's explicit responsibility.
                    img=ImageReader(str(path)); iw,ih=img.getSize()
                    scale=min((W-2*M-20)/iw,(height-20)/ih)
                    dw,dh=iw*scale,ih*scale
                    c.drawImage(img,M+(W-2*M-dw)/2,H-y-(height+dh)/2,dw,dh,mask="auto")
                else:
                    txt(c,"PHOTO UNAVAILABLE",W/2,y+166,16,True,C["muted"],align="center")
                    txt(c,"The manifest entry is retained. Re-fetch required.",W/2,y+193,10,color=C["muted"],align="center")
            else:
                # Honest template placeholder: no fake inspection image.
                txt(c,"PHOTO PLACEMENT EXAMPLE",W/2,y+147,17,True,C["muted"],align="center")
                txt(c,"No actual inspection photo supplied",W/2,y+176,11,color=C["muted"],align="center")
                txt(c,"The uploaded image fills this area without cropping.",W/2,y+198,9,color=C["muted"],align="center")
            txt(c,"CAPTION / FINDING CONTEXT",M,602,8,True,C["navy"])
            chunks=append_paragraph_pages(p.get("caption",""),W-2*M,max_height=70)
            para(c,chunks[0],M,620,W-2*M,70,9.5,13)
            txt(c,"Evidence state: "+p.get("state","template_placeholder"),M,710,8,color=C["muted"])
        footer(c,d,i+1,total,appendix=True)
        c.showPage()

def pdf_file(path,fn):
    path.parent.mkdir(parents=True,exist_ok=True)
    c=canvas.Canvas(str(path),pagesize=(W,H),pageCompression=1,invariant=1)
    c.setTitle(path.stem.replace("-"," "))
    c.setAuthor("PerfectPPI")
    fn(c); c.save()

def build(out):
    complete=json.loads((HERE/"fixtures/complete.json").read_text())
    dents=json.loads((HERE/"fixtures/dents_tires.json").read_text())
    pdf_file(out/"perfectppi-complete-visual-template.pdf",lambda c:visual(c,complete,True))
    pdf_file(out/"perfectppi-dents-tires-visual-template.pdf",lambda c:visual(c,dents,True))
    pdf_file(out/"perfectppi-overview-template.pdf",lambda c:overview(c,complete,True))
    pdf_file(out/"perfectppi-complete-example.pdf",lambda c:(visual(c,complete),overview(c,complete)))
    pdf_file(out/"perfectppi-dents-tires-example.pdf",lambda c:(visual(c,dents),overview(c,dents)))
    pdf_file(out/"perfectppi-photo-evidence-appendix-example.pdf",lambda c:appendix(c,complete))

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir",type=Path,default=HERE.parents[2]/"output/pdf")
    args=parser.parse_args()
    build(args.output_dir.resolve())
    print(f"Rendered 6 PDF artifacts in {args.output_dir.resolve()}")
