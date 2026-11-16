#!/usr/bin/env python3
"""Export harness, step 2: open Vault's export in every spreadsheet program available and
report where they disagree.

Usage: python3 tests/export/compare_apps.py [outDir]          (after export.js)

Programs, each read the way a person would see the file:
  - LibreOffice Calc (headless): the text each cell shows, and a picture of each sheet
  - Gnumeric (ssconvert):        the same
  - Google Sheets:               optional; reads outDir/gsheets.json and outDir/gsheets.pdf
                                 (a session fetches them through the Drive and Sheets
                                 connectors: see README.md)
  - SheetJS:                     what Vault's own Import reads back
  - openpyxl:                    the file as Excel stores it (cell types, number formats,
                                 widths, frozen rows); it doesn't draw anything
  - by hand:                     screenshots from Excel, Numbers etc. in outDir/manual/

Writes outDir/report.md and outDir/report-<sheet>.png (every program's picture of that sheet,
one under another). Exit code 1 if any check fails, so it can guard a fix.
"""
import csv, glob, json, os, re, shutil, subprocess, sys, tempfile
from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "out"))
XLSX = os.path.join(OUT, "vault-export.xlsx")
ODS = os.path.join(OUT, "vault-export.ods")
WORK = tempfile.mkdtemp(prefix="vault-export-")
LO_PROFILE = "file://" + os.path.join(WORK, "lo-profile")
MONEY_COLS = {"Transactions": ["Native Amount", "Amount", "Deposits", "Withdrawals"]}  # header prefixes
DATE_COLS = {"Transactions": ["Date"]}


def run(cmd, cwd=None, timeout=180):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def trim_rows(rows):
    rows = [list(r) for r in rows]
    while rows and not any(norm(c) for c in rows[-1]):
        rows.pop()
    for r in rows:
        while r and not norm(r[-1]):
            r.pop()
    return rows


# ── readers: each returns {sheet: [[shown text]]} ─────────────────────────────────────────────
def sheetjs(path):
    r = run(["node", os.path.join(HERE, "readback.js"), path])
    if r.returncode:
        raise RuntimeError(r.stderr[-400:])
    d = json.loads(r.stdout)
    views = {n: trim_rows([[c["w"] if c else "" for c in row] for row in s["rows"]]) for n, s in d["sheets"].items()}
    return views, d


def libreoffice(path, tag):
    d = os.path.join(WORK, "lo-" + tag)
    os.makedirs(d, exist_ok=True)
    src = os.path.join(d, os.path.basename(path))
    shutil.copy(path, src)
    base = os.path.splitext(os.path.basename(path))[0]
    # tokens: separator, quote, UTF-8, from line 1, -, language, quote all text = false,
    # detect special numbers, SAVE AS SHOWN (token 9) = true, …, every sheet (token 12 = -1).
    # With token 9 false, LibreOffice writes the raw value and every format looks ignored.
    run(["soffice", "-env:UserInstallation=" + LO_PROFILE, "--headless", "--convert-to",
         "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,true,false,false,-1", src], cwd=d)
    # one page per sheet, sized to the sheet, so the picture is the grid as a whole
    run(["soffice", "-env:UserInstallation=" + LO_PROFILE, "--headless", "--convert-to",
         'pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}', src], cwd=d)
    views = {}
    for f in sorted(glob.glob(os.path.join(d, base + "-*.csv"))):
        name = f[len(os.path.join(d, base)) + 1:-4]
        with open(f, encoding="utf-8-sig") as fh:
            views[name] = trim_rows(csv.reader(fh))
    pdf = os.path.join(d, base + ".pdf")
    return views, (pdf if os.path.exists(pdf) else None)


def gnumeric(path, tag):
    d = os.path.join(WORK, "gn-" + tag)
    os.makedirs(d, exist_ok=True)
    # format=preserve writes what each cell shows; the default writes raw values
    run(["ssconvert", "--export-type=Gnumeric_stf:stf_assistant", "-O", "format=preserve separator=, quoting-mode=auto",
         "-S", path, os.path.join(d, "s_%s.csv")])
    run(["ssconvert", path, os.path.join(d, "all.pdf")])
    views = {}
    for f in sorted(glob.glob(os.path.join(d, "s_*.csv"))):
        with open(f, encoding="utf-8-sig") as fh:
            views[os.path.basename(f)[2:-4]] = trim_rows(csv.reader(fh))
    pdf = os.path.join(d, "all.pdf")
    return views, (pdf if os.path.exists(pdf) else None)


def google():
    j = os.path.join(OUT, "gsheets.json")
    if not os.path.exists(j):
        return None, None, None
    d = json.load(open(j))
    views, meta = {}, {}
    for s in d["sheets"]:
        name = s["properties"]["title"]
        grid = s["data"][0]
        views[name] = trim_rows([[v.get("formattedValue", "") for v in r.get("values", [])] for r in grid.get("rowData", [])])
        meta[name] = {
            "frozen": s["properties"].get("gridProperties", {}).get("frozenRowCount", 0),
            "px": [c.get("pixelSize") for c in grid.get("columnMetadata", [])],
            "fonts": sorted({(v.get("effectiveFormat", {}).get("textFormat", {}) or {}).get("fontFamily", "")
                             for r in grid.get("rowData", []) for v in r.get("values", [])} - {""}),
            "bold_header": any((v.get("effectiveFormat", {}).get("textFormat", {}) or {}).get("bold")
                               for v in (grid.get("rowData", [{}])[0].get("values", []))),
        }
    pdf = os.path.join(OUT, "gsheets.pdf")
    return views, meta, (pdf if os.path.exists(pdf) else None)


def excel_model(path):
    """openpyxl: the file as Excel stores it."""
    import openpyxl
    wb = openpyxl.load_workbook(path)
    info = {}
    for ws in wb.worksheets:
        cols = {}
        for k, cd in ws.column_dimensions.items():
            cols[k] = cd.width
        header = [c.value for c in ws[1]]
        cells = []
        for row in ws.iter_rows():
            cells.append([{"v": c.value, "t": c.data_type, "fmt": c.number_format, "date": c.is_date,
                           "font": c.font.name if c.font else None, "bold": bool(c.font and c.font.b)} for c in row])
        info[ws.title] = {"header": header, "cells": cells, "widths": cols, "freeze": ws.freeze_panes}
    return info


# ── pictures ─────────────────────────────────────────────────────────────────────────────────
def pdf_pages(pdf, tag):
    """[(png, text)] for each page."""
    d = os.path.join(WORK, "pg-" + tag)
    os.makedirs(d, exist_ok=True)
    run(["pdftoppm", "-r", "200", "-png", pdf, os.path.join(d, "p")])
    pages = []
    for png in sorted(glob.glob(os.path.join(d, "p-*.png")), key=lambda p: int(re.findall(r"(\d+)\.png$", p)[0])):
        n = int(re.findall(r"(\d+)\.png$", png)[0])
        t = run(["pdftotext", "-layout", "-f", str(n), "-l", str(n), pdf, "-"]).stdout
        pages.append((png, t))
    return pages


def crop(png):
    im = Image.open(png).convert("RGB")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    box = ImageChops.difference(im, bg).getbbox()
    return im.crop((max(0, box[0] - 12), max(0, box[1] - 12), min(im.width, box[2] + 12), min(im.height, box[3] + 12))) if box else im


def pages_by_sheet(pages, views):
    """Give each page to the sheet whose cell text it shares most; a sheet's pages sit side by side."""
    out = {}
    for png, text in pages:
        t = norm(text)
        best, score = None, 0
        for name, rows in views.items():
            cells = {norm(c) for r in rows for c in r if len(norm(c)) > 2}
            s = sum(1 for c in cells if c in t)
            if s > score:
                best, score = name, s
        if best:
            out.setdefault(best, []).append((png, text))
    return out


def side_by_side(pngs):
    ims = [crop(p) if isinstance(p, str) else p for p in pngs]
    w, h = sum(i.width for i in ims), max(i.height for i in ims)
    c = Image.new("RGB", (w, h), "white")
    x = 0
    for i in ims:
        c.paste(i, (x, 0)); x += i.width
    return c


# ── run ──────────────────────────────────────────────────────────────────────────────────────
info = json.load(open(os.path.join(OUT, "export-info.json")))
views, renders, notes = {}, {}, []

views["SheetJS (Vault's import)"], sj_raw = sheetjs(XLSX)
lo_v, lo_pdf = libreoffice(XLSX, "xlsx"); views["LibreOffice"] = lo_v
gn_v, gn_pdf = gnumeric(XLSX, "xlsx"); views["Gnumeric"] = gn_v
g_v, g_meta, g_pdf = google()
if g_v:
    views["Google Sheets"] = g_v
else:
    notes.append("Google Sheets wasn't checked: no gsheets.json (see README.md).")
model = excel_model(XLSX)

for app, pdf in (("LibreOffice", lo_pdf), ("Gnumeric", gn_pdf), ("Google Sheets", g_pdf)):
    if pdf:
        renders[app] = pages_by_sheet(pdf_pages(pdf, re.sub(r"\W", "", app)), views[app])

ods_views = {}
if os.path.exists(ODS):
    ods_views["LibreOffice (.ods)"], _ = libreoffice(ODS, "ods")
    ods_views["Gnumeric (.ods)"], _ = gnumeric(ODS, "ods")

manual = sorted(glob.glob(os.path.join(OUT, "manual", "*.png")) + glob.glob(os.path.join(OUT, "manual", "*.jpg"))
                + glob.glob(os.path.join(OUT, "manual", "*.jpeg")))

checks = []   # (ok, title, detail lines)


def check(ok, title, details=()):
    checks.append((ok, title, list(details)))


sheets = list(model.keys())

# 1. every program shows the same text in every cell
for sheet in sheets:
    apps = [a for a in views if sheet in views[a]]
    nrows = max(len(views[a][sheet]) for a in apps)
    diffs = []
    for r in range(nrows):
        ncols = max((len(views[a][sheet][r]) if r < len(views[a][sheet]) else 0) for a in apps)
        for c in range(ncols):
            shown = {a: norm(views[a][sheet][r][c]) if r < len(views[a][sheet]) and c < len(views[a][sheet][r]) else "" for a in apps}
            if len(set(shown.values())) > 1:
                cell = f"{chr(65 + c)}{r + 1}"
                diffs.append(f"{sheet}!{cell}: " + " · ".join(f"{a} “{v}”" for a, v in shown.items()))
    check(not diffs, f"{sheet}: every program shows the same text", diffs)

# 2. dates are real dates, 3. money has a fixed 2-decimal format, 4. no blank text cells
for sheet, m in model.items():
    hdr = [str(h or "") for h in m["header"]]
    body = m["cells"][1:]
    for prefix in DATE_COLS.get(sheet, []):
        for ci, h in enumerate(hdr):
            if h.startswith(prefix):
                bad = [f"{chr(65 + ci)}{ri + 2} “{row[ci]['v']}” is {'text' if row[ci]['t'] == 's' else row[ci]['t']}"
                       for ri, row in enumerate(body) if ci < len(row) and row[ci]["v"] not in (None, "") and not row[ci]["date"]]
                check(not bad, f"{sheet}: “{h}” holds real dates (each program then shows and sorts them the same way)", bad[:6])
    for prefix in MONEY_COLS.get(sheet, []):
        for ci, h in enumerate(hdr):
            if h.startswith(prefix):
                cells = [row[ci] for row in body if ci < len(row) and isinstance(row[ci]["v"], (int, float))]
                bad = sorted({c["fmt"] for c in cells if not re.search(r"0\.00", c["fmt"] or "")})
                check(not bad, f"{sheet}: “{h}” has a 2-decimal number format (else 7.5 vs 7.50, 1250000 vs 1,250,000)",
                      [f"format is “{b}”" for b in bad])
    blanks = [f"{chr(65 + ci)}{ri + 1}" for ri, row in enumerate(m["cells"]) for ci, c in enumerate(row) if c["v"] == "" and c["t"] == "s"]
    check(not blanks, f"{sheet}: empty cells are empty, not blank text", [", ".join(blanks[:20]) + (" …" if len(blanks) > 20 else "")] if blanks else [])

# 5. header row stays put
tx = model.get("Transactions")
if tx:
    check(tx["freeze"] in ("A2",), "Transactions: the header row is frozen", [f"freeze_panes is {tx['freeze']!r}"])

if g_meta and "Transactions" in g_meta:
    check(g_meta["Transactions"]["frozen"] == 1, "Google Sheets keeps the header row frozen",
          [f"frozen rows: {g_meta['Transactions']['frozen']}"])
    check(g_meta["Transactions"]["bold_header"], "Google Sheets shows the header row in bold")

# 6. nothing is cut off or shown as ### in a program's picture. Two looks: the PDF's text (a
# program that drops clipped letters) and OCR of the picture (one that draws them under a clip).
def ocr(img, rows=None):
    # small text reads badly (Google's PDF shrinks the sheet to the page), so enlarge the
    # picture until each row is at least 60 px tall
    if rows:
        k = 60 * rows / max(1, img.height)
        if k > 1:
            img = img.resize((int(img.width * k), int(img.height * k)), Image.LANCZOS)
    try:
        import pytesseract
        return pytesseract.image_to_string(img, config="--psm 6")
    except Exception as e:
        notes.append(f"OCR unavailable ({e.__class__.__name__}); only the PDF text was checked.")
        return None


def words_missing(cells, seen):
    """Text cells whose words (3+ letters) aren't all in what was seen."""
    # OCR mixes up O/0 and l/I/1 ("1 Oct" reads "1 0ct"), so compare with those folded together
    fold = lambda t: t.lower().translate(str.maketrans("0il|", "o111"))
    low = re.sub(r"[^a-z0-9]+", " ", fold(seen))
    miss = []
    for c in sorted(cells):
        ws = re.findall(r"[A-Za-z]{3,}", c)
        if ws and any(fold(w) not in low for w in ws):
            miss.append(c)
    return miss


pictures = {}   # (app, sheet) -> PIL image
for app, by_sheet in renders.items():
    for sheet, pages in by_sheet.items():
        img = side_by_side([p for p, _ in pages])
        pictures[(app, sheet)] = img
        text = norm(" ".join(t for _, t in pages))
        cells = {norm(c) for r in views[app].get(sheet, []) for c in r if norm(c)}
        cut = {c for c in cells if c not in text}
        seen = ocr(img, len(views[app].get(sheet, [])) + 1)
        if seen is not None:
            cut |= set(words_missing(cells, seen))
        hashes = "###" in text or (seen is not None and "##" in seen)
        details = [f"not shown in full: “{c}”" for c in sorted(cut)[:12]] + (["shows ### (column too narrow for a number)"] if hashes else [])
        check(not cut and not hashes, f"{app} · {sheet}: every cell shows in full", details)

# Screenshots by hand: OCR them and list text that doesn't show in full (a hint, not a check:
# a screenshot may show only part of a sheet).
manual_notes = []
for m in manual:
    seen = ocr(Image.open(m).convert("L"))
    if seen is None:
        continue
    # the sheet this screenshot shows: the one with the largest share of its text cells read
    best = None
    for sheet in views["LibreOffice"]:
        cells = {norm(c) for r in views["LibreOffice"][sheet] for c in r if norm(c) and re.search(r"[A-Za-z]{3,}", c)}
        miss = words_missing(cells, seen)
        share = (len(cells) - len(miss)) / max(1, len(cells))
        if best is None or share > best[0]:
            best = (share, sheet, miss)
    if best and best[0] >= 0.3:
        share, sheet, miss = best
        manual_notes.append(f"{os.path.basename(m)} ({sheet}): " + ("every text cell reads in full" if not miss else
                            "not read in full: " + ", ".join(f"“{c}”" for c in miss[:10])))
    else:
        manual_notes.append(f"{os.path.basename(m)}: couldn't tell which sheet it shows; check it by eye")

# 7. column widths: what each program made of them (report only)
widths = []
for sheet, m in model.items():
    row = [f"| {sheet} | file (Excel’s units) | " + ", ".join(f"{k} {v:.1f}" for k, v in sorted(m["widths"].items()) if v) + " |"]
    if g_meta and sheet in g_meta:
        px = [p for p in g_meta[sheet]["px"] if p][: max(1, len(m["header"]))]
        row.append(f"| {sheet} | Google Sheets (px) | " + ", ".join(f"{chr(65 + i)} {p}" for i, p in enumerate(px)) + " |")
    widths += row

# ── pictures: every program's view of each sheet, one under another ─────────────────────────
font = ImageFont.load_default()
for sheet in sheets:
    blocks = []
    for app in renders:
        if (app, sheet) in pictures:
            # the same height per row in every program, so their widths compare
            img, rows = pictures[(app, sheet)], max(1, len(views[app].get(sheet, [])) + 1)
            k = (28 * rows) / img.height
            blocks.append((app, img.resize((max(1, int(img.width * k)), max(1, int(img.height * k))), Image.LANCZOS)))
    if not blocks:
        continue
    W = max(b.width for _, b in blocks) + 20
    H = sum(b.height + 34 for _, b in blocks) + 10
    canvas = Image.new("RGB", (W, H), (245, 245, 245))
    dr = ImageDraw.Draw(canvas)
    y = 8
    for app, b in blocks:
        dr.text((10, y), app, fill=(160, 40, 40), font=font)
        canvas.paste(b, (10, y + 18))
        dr.rectangle([9, y + 17, 10 + b.width, y + 18 + b.height], outline=(200, 200, 200))
        y += b.height + 34
    canvas.save(os.path.join(OUT, f"report-{sheet}.png"))

# ── report ───────────────────────────────────────────────────────────────────────────────────
failed = [c for c in checks if not c[0]]
lines = [
    "# Vault export: how each program shows it", "",
    f"File: `{info['appFileName']}` from {info['appVersion']} (SheetJS {info['sheetjs']}), fixture `tests/export/fixture.js`.", "",
    "Programs: " + ", ".join(views.keys()) + "; openpyxl for the file as Excel stores it."
    + (f" Screenshots by hand: {', '.join(os.path.basename(m) for m in manual)}." if manual else " No screenshots by hand (Excel, Numbers) yet."), "",
]
lines += [f"- {n}" for n in notes]
lines += ["", f"## Checks: {len(checks) - len(failed)} of {len(checks)} pass", ""]
for ok, title, det in checks:
    lines.append(f"- {'✅' if ok else '❌'} {title}")
    lines += [f"  - {d}" for d in det]
lines += ["", "## Column widths", "", "| Sheet | Where | Widths |", "|---|---|---|"] + widths
if g_meta:
    lines += ["", "## Google Sheets", ""]
    for s, m in g_meta.items():
        lines.append(f"- {s}: font {', '.join(m['fonts']) or '?'}, header bold: {m['bold_header']}, frozen rows: {m['frozen']}")
if ods_views:
    lines += ["", "## Same data as .ods", ""]
    for app, v in ods_views.items():
        same = all(v.get(s) == views["LibreOffice"].get(s) for s in sheets) if app.startswith("LibreOffice") else \
            all(v.get(s) == views["Gnumeric"].get(s) for s in sheets)
        lines.append(f"- {app}: {'shows the same as the .xlsx' if same else 'shows something different from the .xlsx'}")
if manual_notes:
    lines += ["", "## Screenshots by hand (OCR)", ""] + [f"- {n}" for n in manual_notes]
lines += ["", "## Pictures", ""] + [f"- `report-{s}.png`" for s in sheets if os.path.exists(os.path.join(OUT, f'report-{s}.png'))]
open(os.path.join(OUT, "report.md"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
shutil.rmtree(WORK, ignore_errors=True)
sys.exit(1 if failed else 0)
