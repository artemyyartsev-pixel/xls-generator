#!/usr/bin/env python3
"""
XLS Processor — reads xlsx structure and executes AI-generated openpyxl code.
Supports .xls (legacy) via xlrd → openpyxl conversion.
Called by Express via subprocess.
"""

import sys
import json
import os
import traceback
import tempfile


def convert_xls_to_xlsx(xls_path: str) -> str:
    """
    Convert a legacy .xls file to a temporary .xlsx using xlrd + openpyxl.
    Returns path to the new .xlsx file (caller must delete it when done).
    """
    import xlrd
    import openpyxl

    wb_xls = xlrd.open_workbook(xls_path, formatting_info=False)
    wb_xlsx = openpyxl.Workbook()
    wb_xlsx.remove(wb_xlsx.active)  # remove default empty sheet

    for sheet_idx in range(wb_xls.nsheets):
        ws_xls = wb_xls.sheet_by_index(sheet_idx)
        ws_xlsx = wb_xlsx.create_sheet(title=ws_xls.name)

        for row_idx in range(ws_xls.nrows):
            for col_idx in range(ws_xls.ncols):
                cell = ws_xls.cell(row_idx, col_idx)
                # xlrd type: 0=empty, 1=text, 2=number, 3=date, 4=bool, 5=error
                if cell.ctype == 1:
                    value = cell.value
                elif cell.ctype == 2:
                    # Store as int if it's a whole number
                    value = int(cell.value) if cell.value == int(cell.value) else cell.value
                elif cell.ctype == 4:
                    value = bool(cell.value)
                elif cell.ctype == 3:
                    # Convert xlrd date tuple to Python datetime
                    try:
                        import datetime
                        date_tuple = xlrd.xldate_as_tuple(cell.value, wb_xls.datemode)
                        if date_tuple[3:] == (0, 0, 0):
                            value = datetime.date(*date_tuple[:3])
                        else:
                            value = datetime.datetime(*date_tuple)
                    except Exception:
                        value = cell.value
                else:
                    value = cell.value if cell.ctype != 0 else None

                if value is not None and value != "":
                    ws_xlsx.cell(row=row_idx + 1, column=col_idx + 1, value=value)

    tmp_path = xls_path + "_converted.xlsx"
    wb_xlsx.save(tmp_path)
    return tmp_path


def ensure_xlsx(path: str):
    """
    If path is a .xls file, convert to .xlsx and return (new_path, True).
    Otherwise return (path, False). Second value indicates temp file was created.
    """
    if path.lower().endswith(".xls") and not path.lower().endswith(".xlsx"):
        converted = convert_xls_to_xlsx(path)
        return converted, True
    return path, False


def analyze_file(path: str) -> dict:
    """Read xlsx structure: sheets, columns, row counts, sample data."""
    converted_path = None
    try:
        import openpyxl

        # Auto-convert .xls → .xlsx
        work_path, was_converted = ensure_xlsx(path)
        if was_converted:
            converted_path = work_path

        wb = openpyxl.load_workbook(work_path, read_only=True, data_only=True)
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
    finally:
        if converted_path and os.path.exists(converted_path):
            try:
                os.unlink(converted_path)
            except Exception:
                pass


def execute_code(input_path: str, code: str, output_path: str) -> dict:
    """
    Execute AI-generated openpyxl code in a restricted namespace.
    The code receives `wb` (openpyxl Workbook) and `ws` (active sheet).
    It must modify wb in place. Returns list of changes made.
    """
    converted_path = None
    try:
        import openpyxl
        from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
        from openpyxl.utils import get_column_letter, column_index_from_string
        import re

        # Auto-convert .xls → .xlsx before execution
        work_path, was_converted = ensure_xlsx(input_path)
        if was_converted:
            converted_path = work_path

        wb = openpyxl.load_workbook(work_path)

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
    finally:
        if converted_path and os.path.exists(converted_path):
            try:
                os.unlink(converted_path)
            except Exception:
                pass


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
