#!/usr/bin/env python3
"""
XLS Processor — reads xlsx structure and executes AI-generated openpyxl code.
Called by Express via subprocess.
"""

import sys
import json
import os
import traceback
import tempfile

def analyze_file(path: str) -> dict:
    """Read xlsx structure: sheets, columns, row counts, sample data."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        sheets = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = list(ws.iter_rows(max_row=6, values_only=True))
            if not rows:
                sheets.append({"name": sheet_name, "columns": [], "row_count": 0, "sample": []})
                continue

            # Headers from first row
            headers = [str(c) if c is not None else f"Col{i+1}" for i, c in enumerate(rows[0])]
            # Count rows (approximate — read_only is fast)
            row_count = ws.max_row or 0
            # Sample: first 5 data rows
            sample = []
            for row in rows[1:6]:
                sample.append([str(v) if v is not None else "" for v in row])

            sheets.append({
                "name": sheet_name,
                "columns": headers,
                "row_count": max(0, row_count - 1),
                "sample": sample
            })
        wb.close()
        return {"ok": True, "sheets": sheets}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def execute_code(input_path: str, code: str, output_path: str) -> dict:
    """
    Execute AI-generated openpyxl code in a restricted namespace.
    The code receives `wb` (openpyxl Workbook) and `ws` (active sheet).
    It must modify wb in place. Returns list of changes made.
    """
    try:
        import openpyxl
        from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
        from openpyxl.utils import get_column_letter, column_index_from_string
        import re

        wb = openpyxl.load_workbook(input_path)

        # Safe namespace — only openpyxl + builtins needed for spreadsheet work
        safe_globals = {
            "__builtins__": {
                "range": range, "len": len, "print": print,
                "str": str, "int": int, "float": float, "bool": bool,
                "list": list, "dict": dict, "tuple": tuple, "set": set,
                "enumerate": enumerate, "zip": zip, "map": map, "filter": filter,
                "min": min, "max": max, "sum": sum, "abs": abs, "round": round,
                "isinstance": isinstance, "type": type, "hasattr": hasattr,
                "getattr": getattr, "setattr": setattr,
                "True": True, "False": False, "None": None,
                "Exception": Exception, "ValueError": ValueError,
            },
            "openpyxl": openpyxl,
            "PatternFill": PatternFill,
            "Font": Font,
            "Alignment": Alignment,
            "Border": Border,
            "Side": Side,
            "get_column_letter": get_column_letter,
            "column_index_from_string": column_index_from_string,
            "re": re,
            "wb": wb,
            "changes": [],
        }

        exec(code, safe_globals)

        wb.save(output_path)

        changes = safe_globals.get("changes", [])
        return {"ok": True, "changes": changes}

    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc()}


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""

    if cmd == "analyze":
        path = sys.argv[2]
        result = analyze_file(path)
        print(json.dumps(result, ensure_ascii=False))

    elif cmd == "execute":
        input_path = sys.argv[2]
        output_path = sys.argv[3]
        code_file = sys.argv[4]
        with open(code_file, "r", encoding="utf-8") as f:
            code = f.read()
        result = execute_code(input_path, code, output_path)
        print(json.dumps(result, ensure_ascii=False))

    else:
        print(json.dumps({"ok": False, "error": f"Unknown command: {cmd}"}))
        sys.exit(1)
