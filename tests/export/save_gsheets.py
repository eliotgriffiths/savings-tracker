#!/usr/bin/env python3
"""Export harness helper: save what the Google Sheets connector returned, for compare_apps.py.
Usage: python3 tests/export/save_gsheets.py <get_spreadsheet result .json> <exported .pdf> <outDir>
(both files are the ones the connector saves to disk; see README.md)."""
import json, shutil, sys
res, pdf, out = sys.argv[1:4]
raw = json.load(open(res))
obj = json.loads(raw[0]["text"]) if isinstance(raw, list) else raw
json.dump(obj.get("content", obj), open(f"{out}/gsheets.json", "w"), indent=1)
shutil.copy(pdf, f"{out}/gsheets.pdf")
print("saved gsheets.json and gsheets.pdf to", out)
