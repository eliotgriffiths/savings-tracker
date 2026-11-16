# Export harness

Checks that Vault's **Export spreadsheet** looks the same in every spreadsheet program. Built 16 Nov 2026.

It runs the real export from `index.html` on a fixed set of test transactions, opens the file in each program it can reach, and reports where they differ. Rerun it whenever the export changes, when SheetJS is updated, or every few months (programs change how they open files too).

## What it opens the file with

| Program | How | What it gives |
|---|---|---|
| LibreOffice Calc | headless, in the session | the text each cell shows, and a picture of each sheet |
| Gnumeric | `ssconvert`, in the session | the same |
| Google Sheets | the Drive and Sheets connectors (a session step, below) | the text each cell shows, fonts, bold, frozen rows, column widths and a picture |
| SheetJS | `readback.js` | what Vault's own Import reads back |
| openpyxl | in the session | the file as Excel stores it: cell types, number formats, widths, frozen rows. It doesn't draw anything |
| Excel, Numbers, others | screenshots from Eliot, in `out/manual/` | OCR reads them and lists any text that doesn't show in full |

## The checks

1. Every program shows the same text in every cell.
2. Dates are real dates, not text, so every program shows and sorts them the same way.
3. Every money column has a fixed 2-decimal format. Without one, programs show 7.5 or 7.50, and 1250000 or 1,250,000.
4. Empty cells are truly empty, not blank text.
5. The header row is frozen, in the file and in Google Sheets.
6. Google Sheets shows the header row in bold.
7. Nothing is cut off or shown as `###` in any program's picture. This uses both the PDF's text and OCR of the picture: some programs drop clipped letters, others draw them under a clip.

The report also lists each column's width in each program. `report-<sheet>.png` shows every program's picture of that sheet, one under another, at the same height per row so the widths compare.

## Running it

Setup in a fresh session:
```
apt-get update && apt-get install -y --no-install-recommends gnumeric tesseract-ocr tesseract-ocr-eng   # LibreOffice and poppler are already there
pip install --break-system-packages pytesseract openpyxl pillow
cd /home/claude && npm install jsdom
```

Then, from the repo root:
```
TZ=Australia/Brisbane node tests/export/export.js        # out/: the app's .xlsx, plus .ods and .csv of the same workbook
python3 tests/export/compare_apps.py                     # out/report.md and out/report-*.png
```
It exits with 1 if any check fails.

### Google Sheets (a session step)

1. `sha256sum tests/export/out/vault-export.xlsx`
2. Drive `create_file`: title "Vault export harness (test data, safe to delete)", `contentMimeType` = the xlsx type, `base64Content` = `sha256:<hash>:<absolute path>`. Conversion is on by default, so Drive makes a Google Sheet.
3. Sheets `get_spreadsheet` on the new ID, with `includeGridData: true` and these fields: `sheets.properties.title`, `sheets.properties.gridProperties.frozenRowCount`, `sheets.data.columnMetadata.pixelSize`, `sheets.data.rowData.values.formattedValue`, `sheets.data.rowData.values.effectiveFormat.numberFormat`, `sheets.data.rowData.values.effectiveFormat.horizontalAlignment`, `sheets.data.rowData.values.effectiveFormat.textFormat.fontFamily`, `sheets.data.rowData.values.effectiveFormat.textFormat.bold`. The result is saved to a file.
4. Drive `download_file_content` with `exportMimeType: application/pdf`. This is saved to a file too.
5. `python3 tests/export/save_gsheets.py <result .json> <the .pdf> tests/export/out`
6. Run `compare_apps.py` again, then trash the Google copy with Drive `trash_file`.

### Excel, Numbers and others (Eliot)

Send Eliot `out/vault-export.xlsx`. He opens it in each program, takes a screenshot of each sheet, and sends them back. Save them as `out/manual/<program>-<sheet>.png` and run `compare_apps.py` again. Look at the pictures as well: OCR can't judge alignment or spacing.

## Trying a fix first

`candidate.js` takes the workbook the app makes, applies the tweaks being tried, and writes it to `out-candidate/` (or the folder given). The defaults are "trial 3" (Arial, frozen header, a set row height), which looked right in iPhone's file preview. `CANDIDATE_FONT` sets another font (`""` keeps Calibri), and `CANDIDATE_FREEZE=0` leaves the header row unfrozen. Run `compare_apps.py tests/export/out-candidate` (and the Google step on that folder) to see whether each tweak holds up everywhere, before any of it goes into `exportRowsXLSX`. Nothing in `candidate.js` changes the app.

## Things learned building it (16 Nov 2026)

- LibreOffice's CSV export writes raw values unless token 9 ("save cell contents as shown") is `true`. Gnumeric needs `--export-type=Gnumeric_stf:stf_assistant -O format=preserve`. Without those, every number format looks ignored. If the harness says a format is ignored, check this first.
- LibreOffice's `SinglePageSheets` PDF option draws each sheet on one page sized to it. Gnumeric and Google split pages, so the harness assigns each page to a sheet by its text and puts the pages side by side.
- SheetJS's free build writes number formats (`cell.z`) and column widths, but not frozen panes, bold text or alignment. `candidate.js` adds those by editing the file's XML after it's written, using SheetJS's own zip reader (`XLSX.CFB`; paths start with `/`). LibreOffice, Gnumeric, Google Sheets and openpyxl all read the result.
- OCR mixes up O/0 and l/1 ("1 Oct" reads as "1 0ct"), so the comparison folds those together. It also misreads small text, so pictures are enlarged to at least 60 px a row first (Google's PDF shrinks the sheet to fit the page).
- **iPhone's file preview (Files, Mail; 16 Nov):** it draws Calibri, SheetJS's default font, as Times, because iPhone doesn't have Calibri. Arial is on iPhone, Windows and Mac and is Google Sheets' default; LibreOffice swaps in Liberation Sans, which is the same width. Arial runs about 15 % wider than Calibri, so widths measured in characters need room for it.
- On the first trial file, iPhone's preview pushed the totals rows to the bottom of the screen, with blank rows above them. It wasn't the frozen header: trials 2 (not frozen) and 3 (frozen) both set a height on every row, and both showed the totals straight under the transactions. Keep the row heights.
- The file is named `compare_apps.py`, not `inspect.py`: a file called `inspect.py` hides Python's own `inspect` module, and openpyxl fails to import.
