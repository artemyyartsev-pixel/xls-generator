import type { Express } from "express";
import type { Server } from "node:http";
import multer from "multer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

// ─── Multer: store uploads in /tmp ───────────────────────────────────────────
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|xlsm)$/i.test(file.originalname);
    cb(null, ok);
  },
});

// ─── Models ──────────────────────────────────────────────────────────────────
const MODELS: Record<string, { provider: "openrouter" | "anthropic"; model: string; label: string }> = {
  deepseek_v3:    { provider: "openrouter", model: "deepseek/deepseek-chat",        label: "DeepSeek V3" },
  deepseek_r1:    { provider: "openrouter", model: "deepseek/deepseek-r1",          label: "DeepSeek R1" },
  gpt_4o_mini:    { provider: "openrouter", model: "openai/gpt-4o-mini",            label: "GPT-4o mini" },
};

// ─── Helper: call OpenRouter ─────────────────────────────────────────────────
async function callLLM(modelId: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const m = MODELS[modelId] || MODELS.deepseek_v3;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://xls-generator.app",
      "X-Title": "XLS Generator",
    },
    body: JSON.stringify({
      model: m.model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Helper: run Python script ───────────────────────────────────────────────
const PY_SCRIPT = path.join(process.cwd(), "server", "xlsProcessor.py");

async function pyAnalyze(filePath: string, originalName: string) {
  const { stdout } = await execFileAsync("python3", [PY_SCRIPT, "analyze", filePath, originalName], { timeout: 15000 });
  return JSON.parse(stdout.trim());
}

async function pyExecute(inputPath: string, outputPath: string, code: string, originalName: string) {
  // Write code to temp file to avoid shell injection
  const codeFile = path.join(os.tmpdir(), `xls_code_${Date.now()}.py`);
  fs.writeFileSync(codeFile, code, "utf-8");
  try {
    const { stdout } = await execFileAsync(
      "python3", [PY_SCRIPT, "execute", inputPath, outputPath, codeFile, originalName],
      { timeout: 30000 }
    );
    return JSON.parse(stdout.trim());
  } finally {
    fs.unlink(codeFile, () => {});
  }
}

// ─── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert Python/openpyxl developer. The user will describe a task to perform on an Excel file.
You will receive the file structure (sheets, columns, sample data) and the user's task description.

Generate Python code that uses openpyxl to modify the workbook. Rules:
1. The variable "wb" is an already-loaded openpyxl Workbook. Use wb.active or wb["SheetName"] to access sheets.
2. Available objects (DO NOT use import statements — all are already in scope):
   - openpyxl, PatternFill, Font, Alignment, Border, Side
   - get_column_letter, column_index_from_string
   - BarChart, LineChart, PieChart, Reference, Series, DataPoint
   - datetime  — this is the datetime CLASS (datetime.datetime). Use: isinstance(x, datetime), datetime.now()
   - date      — datetime.date class. Use: isinstance(x, date), date.today()
   - time      — datetime.time class
   - timedelta — datetime.timedelta class
   - math, re, defaultdict, Counter
3. After each significant change, append to the "changes" list:
   changes.append({"type": "add"|"modify"|"format"|"delete", "description": "...", "detail": "..."})
4. Use English in code (variable names, comments). Russian is allowed only in string literals for cell values/messages.
5. Do NOT use import statements — everything is already available.
6. Do NOT save the workbook — it will be saved automatically.
7. Handle errors gracefully with try/except where appropriate.
8. Be precise with column references — use the actual column names from the provided structure.
9. Return ONLY the Python code, no markdown fences, no explanation.
10. Date values from Excel cells are datetime objects — use isinstance(x, datetime) to check, then x.year, x.month, x.day.
11. For charts: write data to sheet first, then build chart using Reference pointing to that data.

Example for "add chart showing mileage by year/quarter":
ws2 = wb.create_sheet("Лист2")
ws2.cell(row=1, column=1).value = "Период"
ws2.cell(row=1, column=2).value = "Пробег"
ws_data = wb["Лист1"]
by_period = defaultdict(float)
for row in range(2, ws_data.max_row + 1):
    d = ws_data.cell(row=row, column=1).value
    v = ws_data.cell(row=row, column=2).value
    if isinstance(d, datetime) and isinstance(v, (int, float)):
        key = f"{d.year} Q{(d.month-1)//3+1}"
        by_period[key] += v
for i, (k, v) in enumerate(sorted(by_period.items()), start=2):
    ws2.cell(row=i, column=1).value = k
    ws2.cell(row=i, column=2).value = round(v, 2)
chart = LineChart()
chart.title = "Динамика пробега"
chart.width = 20
chart.height = 12
data_ref = Reference(ws2, min_col=2, min_row=1, max_row=ws2.max_row)
cats_ref = Reference(ws2, min_col=1, min_row=2, max_row=ws2.max_row)
chart.add_data(data_ref, titles_from_data=True)
chart.set_categories(cats_ref)
ws2.add_chart(chart, "D2")
changes.append({"type": "add", "description": "Добавлен Лист2 с графиком пробега", "detail": f"{len(by_period)} периодов"})`;

// ─── Fix multer filename encoding (multer reads UTF-8 bytes as Latin-1) ────────
function fixFilename(name: string): string {
  try {
    // Re-encode: treat the string as Latin-1 bytes → decode as UTF-8
    return Buffer.from(name, "latin1").toString("utf8");
  } catch {
    return name;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export function registerRoutes(httpServer: Server, app: Express) {

  // GET /api/models
  app.get("/api/models", (_req, res) => {
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
    res.json(Object.entries(MODELS).map(([id, m]) => ({
      id,
      label: m.label,
      provider: m.provider,
      available: hasOpenRouter,
    })));
  });

  // POST /api/analyze-file — multipart, field: file
  app.post("/api/analyze-file", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    try {
      const result = await pyAnalyze(req.file.path, fixFilename(req.file.originalname));
      if (!result.ok) return res.status(422).json({ error: result.error });
      res.json({
        filename: fixFilename(req.file.originalname),
        size: req.file.size,
        sheets: result.sheets,
        tempPath: req.file.path,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/process-file — multipart, fields: file, task, modelId
  app.post("/api/process-file", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const task: string = req.body.task || "";
    const modelId: string = req.body.modelId || "deepseek_v3";

    if (!task.trim()) return res.status(400).json({ error: "Task is required" });

    let tempOutput: string | null = null;

    try {
      // 1. Analyze structure
      const analysis = await pyAnalyze(req.file.path, fixFilename(req.file.originalname));
      if (!analysis.ok) return res.status(422).json({ error: analysis.error });

      // 2. Build LLM prompt with file structure
      const structureDesc = analysis.sheets.map((s: any) => {
        const cols = s.columns.join(", ");
        const sampleRows = s.sample.slice(0, 3).map((r: any[]) => r.join(" | ")).join("\n    ");
        return `Sheet "${s.name}": ${s.row_count} rows, columns: [${cols}]\n  Sample:\n    ${sampleRows}`;
      }).join("\n\n");

      const userPrompt = `File structure:\n${structureDesc}\n\nUser task: ${task}`;

      // 3. Generate Python code via LLM
      const code = await callLLM(modelId, SYSTEM_PROMPT, userPrompt);

      // Strip markdown fences if LLM added them
      const cleanCode = code
        .replace(/^```python\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      // 4. Execute code on the file
      const origName = fixFilename(req.file.originalname).replace(/\.(xlsx|xls|xlsm)$/i, "");
      tempOutput = path.join(os.tmpdir(), `xls_out_${Date.now()}_${origName}_updated.xlsx`);

      const execResult = await pyExecute(req.file.path, tempOutput, cleanCode, fixFilename(req.file.originalname));

      if (!execResult.ok) {
        return res.status(422).json({
          error: "Code execution failed",
          detail: execResult.error,
          code: cleanCode,
        });
      }

      // 5. Read output file and return as JSON with base64
      const outBuffer = fs.readFileSync(tempOutput);
      const outFilename = `${origName}_updated.xlsx`;

      res.json({
        ok: true,
        filename: outFilename,
        changes: execResult.changes || [],
        file: outBuffer.toString("base64"),
      });

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      // Cleanup temp files
      if (req.file) fs.unlink(req.file.path, () => {});
      if (tempOutput) fs.unlink(tempOutput, () => {});
    }
  });
}
