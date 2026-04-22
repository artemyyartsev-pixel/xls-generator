import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLang } from "@/lib/LanguageContext";

// Resolve correct API base (handles __PORT_5000__ token replacement after deploy)
const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ─── Types ───────────────────────────────────────────────────────────────────
interface SheetInfo {
  name: string;
  columns: string[];
  row_count: number;
  sample: string[][];
}

interface FileAnalysis {
  filename: string;
  size: number;
  sheets: SheetInfo[];
  tempPath: string;
}

interface Change {
  type: "add" | "modify" | "format" | "delete";
  description: string;
  detail: string;
}

interface Model {
  id: string;
  label: string;
  provider: string;
  available: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────
// EXAMPLES is now built dynamically inside the component using t

const FALLBACK_MODELS: Model[] = [
  { id: "deepseek_v3", label: "DeepSeek V3", provider: "openrouter", available: true },
  { id: "deepseek_r1", label: "DeepSeek R1", provider: "openrouter", available: true },
  { id: "gpt_4o_mini", label: "GPT-4o mini", provider: "openrouter", available: true },
  { id: "claude_sonnet", label: "Claude Sonnet", provider: "openrouter", available: true },
];

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  const { t, lang, setLang } = useLang();
  const EXAMPLES = [
    { emoji: "📊", title: t.ex1Title, task: t.ex1Task },
    { emoji: "🎨", title: t.ex2Title, task: t.ex2Task },
    { emoji: "📈", title: t.ex3Title, task: t.ex3Task },
    { emoji: "🔍", title: t.ex4Title, task: t.ex4Task },
    { emoji: "🗓️", title: t.ex5Title, task: t.ex5Task },
  ];
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [models, setModels] = useState<Model[]>(FALLBACK_MODELS);
  const [modelId, setModelId] = useState("deepseek_v3");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [task, setTask] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Processing state
  const [status, setStatus] = useState<"idle" | "analyzing" | "processing" | "done" | "error">("idle");
  const [loadingStep, setLoadingStep] = useState(0);
  const [changes, setChanges] = useState<Change[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("");
  const [usedModelLabel, setUsedModelLabel] = useState("");
  const [resultKey, setResultKey] = useState(0); // increments on each new result
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch models
  useEffect(() => {
    apiRequest("GET", "/api/models")
      .then(r => r.json())
      .then((data: Model[]) => { if (data?.length) setModels(data); })
      .catch(() => {});
  }, []);

  // ─── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    if (!/\.(xlsx|xls|xlsm)$/i.test(f.name)) {
      toast({ title: "Неверный формат", description: "Поддерживаются .xlsx, .xls, .xlsm", variant: "destructive" });
      return;
    }
    setFile(f);
    setAnalysis(null);
    setStatus("analyzing");
    setChanges([]);
    setDownloadUrl(null);
    setErrorMsg("");

    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`${API_BASE}/api/analyze-file`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка анализа");
      setAnalysis(data);
      setActiveSheet(0);
      setStatus("idle");
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message);
      toast({ title: t.toastAnalysisError, description: e.message, variant: "destructive" });
    }
  }, [toast]);

  // Drag & drop
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ─── Process ────────────────────────────────────────────────────────────────
  async function handleProcess() {
    if (!file || !task.trim()) return;
    setStatus("processing");
    setLoadingStep(1);
    setChanges([]);
    setDownloadUrl(null);
    setErrorMsg("");

    // Animate steps
    const stepTimer = setInterval(() => {
      setLoadingStep(s => s < 4 ? s + 1 : s);
    }, 2500);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("task", task);
      fd.append("modelId", modelId);

      const res = await fetch(`${API_BASE}/api/process-file`, { method: "POST", body: fd });

      clearInterval(stepTimer);

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Ошибка ${res.status}`);
      }

      // Decode base64 file → blob URL
      const byteChars = atob(data.file);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      // Revoke previous blob URL to free memory
      setDownloadUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      const url = URL.createObjectURL(blob);
      const currentModel = models.find(m => m.id === modelId);

      setChanges(data.changes || []);
      setDownloadUrl(url);
      // Add model + datetime suffix so every download is unique
      const baseName = (data.filename || "updated.xlsx").replace(/\.xlsx$/i, "");
      const modelSuffix = (currentModel?.label || modelId).replace(/[^a-zA-Z0-9а-яА-Я]/g, "_");
      const now = new Date();
      const dateSuffix = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
      setDownloadName(`${baseName}_${modelSuffix}_${dateSuffix}.xlsx`);
      setUsedModelLabel(currentModel?.label || modelId);
      setResultKey(k => k + 1);
      setLoadingStep(4);
      setStatus("done");

      toast({ title: t.toastDoneTitle(currentModel?.label || modelId), description: t.toastDoneDesc((data.changes || []).length) });
    } catch (e: any) {
      clearInterval(stepTimer);
      setStatus("error");
      setErrorMsg(e.message);
      toast({ title: t.toastProcessError, description: e.message, variant: "destructive" });
    }
  }

  function handleDownload() {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = downloadName;
    a.click();
  }

  function resetFile() {
    setFile(null);
    setAnalysis(null);
    setStatus("idle");
    setChanges([]);
    setDownloadUrl(null);
    setErrorMsg("");
    setTask("");
  }

  const sheet = analysis?.sheets[activeSheet];
  const isLoading = status === "analyzing" || status === "processing";

  const LOADING_STEPS = [
    t.processingSteps[1],
    "Генерирую код обработки...",
    "Применяю изменения к файлу",
    "Формирую файл для скачивания",
  ];

  const CHANGE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    add:    { bg: "bg-green-500/10",  text: "text-green-400",  label: "ДОБАВЛЕНО" },
    modify: { bg: "bg-orange-500/10", text: "text-orange-400", label: "ИЗМЕНЕНО" },
    format: { bg: "bg-blue-500/10",   text: "text-blue-400",   label: "ФОРМАТ" },
    delete: { bg: "bg-red-500/10",    text: "text-red-400",    label: "УДАЛЕНО" },
  };

  return (
    <div className="min-h-screen" style={{ background: "#0d1117", color: "#e6edf3" }}>

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="border-b sticky top-0 z-50 backdrop-blur-sm" style={{ borderColor: "#30363d", background: "rgba(22,27,34,0.95)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[52px] flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-[7px] grid place-items-center font-mono text-[11px] font-bold text-white" style={{ background: "#f97316" }}>
              XLS
            </div>
            <div>
              <div className="font-mono text-sm font-semibold" style={{ color: "#e6edf3" }}>{t.headerTitle.split(" ").slice(0,2).join(" ")}</div>
              <div className="font-mono text-[10px]" style={{ color: "#8b949e" }}>{t.headerTitle.split(" ").slice(2).join(" ")}</div>
            </div>
          </div>

          {/* Tab switcher */}
          <nav className="flex gap-[2px] rounded-lg p-[3px] border ml-2" style={{ background: "#0d1117", borderColor: "#30363d" }}>
            <a
              href="https://www.perplexity.ai/computer/a/vba-generator-_u6z8hjVSR2D10wXWQiAcA"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-[5px] rounded-md text-xs font-mono font-medium transition-all"
              style={{ color: "#8b949e" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e6edf3")}
              onMouseLeave={e => (e.currentTarget.style.color = "#8b949e")}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#8b949e" }} />
              {t.tabVba}
            </a>
            <div className="flex items-center gap-1.5 px-3 py-[5px] rounded-md text-xs font-mono font-medium border" style={{ color: "#f97316", background: "rgba(249,115,22,0.12)", borderColor: "rgba(249,115,22,0.25)" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#f97316" }} />
              XLS Generator
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Language switcher */}
            <button
              onClick={() => setLang(lang === "ru" ? "en" : "ru")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-[11px] border transition-all"
              style={{ color: "#8b949e", borderColor: "#30363d", background: "transparent" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#e6edf3"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#8b949e"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#8b949e"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#30363d"; }}
              title={lang === "ru" ? "Switch to English" : "Переключить на русский"}
            >
              {lang === "ru" ? "🇷🇺 RU" : "🇬🇧 EN"}
            </button>
            {/* Model badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] border" style={{ color: "#f97316", background: "rgba(249,115,22,0.1)", borderColor: "rgba(249,115,22,0.3)" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#f97316" }} />
              {models.find(m => m.id === modelId)?.label || "DeepSeek V3"}
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main ───────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[11px] border mb-4" style={{ color: "#f97316", background: "rgba(249,115,22,0.1)", borderColor: "rgba(249,115,22,0.25)" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#f97316" }} />
            {t.heroBadge}
          </div>
          <h1 className="text-3xl font-bold font-mono mb-2" style={{ color: "#e6edf3" }}>
            {t.heroTitle1}{" "}
            <span style={{ color: "#f97316" }}>{t.heroAccent}</span>
          </h1>
          <p className="text-sm max-w-md mx-auto leading-relaxed" style={{ color: "#8b949e" }}>
            {t.heroSub}
          </p>
        </div>

        {/* Two-column workspace */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "380px 1fr" }}>

          {/* ── LEFT: Input ─────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border overflow-hidden" style={{ background: "#161b22", borderColor: "#30363d" }}>
              <div className="px-4 py-3 border-b flex items-center gap-2 font-mono text-xs font-semibold" style={{ borderColor: "#30363d", color: "#8b949e" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M4 5h6M4 7.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {t.panelFileTitle}
              </div>
              <div className="p-4">

                {/* Upload zone */}
                <div
                  ref={dropRef}
                  data-testid="upload-zone"
                  className="rounded-xl p-6 text-center cursor-pointer transition-all mb-3 border-2 border-dashed"
                  style={{
                    borderColor: isDragging ? "#f97316" : analysis ? "rgba(249,115,22,0.5)" : "#30363d",
                    background: isDragging || analysis ? "rgba(249,115,22,0.08)" : "transparent",
                    borderStyle: analysis ? "solid" : "dashed",
                  }}
                  onClick={() => !isLoading && fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.xlsm"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                  {status === "analyzing" ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full border-2 border-t-orange-400 animate-spin" style={{ borderColor: "#30363d", borderTopColor: "#f97316" }} />
                      <p className="text-xs font-mono" style={{ color: "#f97316" }}>{t.processingSteps[1]}</p>
                    </div>
                  ) : analysis ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-3xl">📊</span>
                      <p className="text-sm font-semibold font-mono" style={{ color: "#f97316" }}>{analysis.filename}</p>
                      <p className="text-xs" style={{ color: "#8b949e" }}>{t.uploadReplace}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="opacity-40">
                        <rect x="5" y="3" width="18" height="26" rx="2" stroke="#e6edf3" strokeWidth="1.3"/>
                        <path d="M9 10h10M9 14h8M9 18h10" stroke="#e6edf3" strokeWidth="1.3" strokeLinecap="round"/>
                        <circle cx="27" cy="27" r="7" fill="#f97316"/>
                        <path d="M27 24v6M24 27l3-3 3 3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <p className="text-sm font-semibold" style={{ color: "#e6edf3" }}>{t.uploadTitle}</p>
                      <p className="text-xs" style={{ color: "#8b949e" }}>{t.uploadSub}</p>
                    </div>
                  )}
                </div>

                {/* File info */}
                {analysis && (
                  <div className="rounded-lg p-3 mb-3 flex items-start gap-2.5 border" style={{ background: "#1c2128", borderColor: "#30363d" }}>
                    <div className="w-7 h-7 rounded-md grid place-items-center text-sm flex-shrink-0" style={{ background: "rgba(249,115,22,0.15)" }}>📊</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-semibold truncate" style={{ color: "#f97316" }}>{analysis.filename}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "#8b949e" }}>
                        {t.sheetLabel(analysis.sheets.length, analysis.sheets[0]?.row_count ?? 0, formatBytes(analysis.size))}
                      </p>
                    </div>
                    <button onClick={resetFile} className="text-lg leading-none mt-0.5 hover:text-red-400 transition-colors" style={{ color: "#8b949e" }}>×</button>
                  </div>
                )}

                {/* Sheet + column preview */}
                {analysis && (
                  <div className="rounded-lg p-3 mb-3 border" style={{ background: "#1c2128", borderColor: "#30363d" }}>
                    <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "#8b949e" }}>Структура файла</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {analysis.sheets.map((s, i) => (
                        <button
                          key={i}
                          data-testid={`sheet-tab-${i}`}
                          onClick={() => setActiveSheet(i)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono border transition-all"
                          style={i === activeSheet ? {
                            color: "#f97316", background: "rgba(249,115,22,0.12)", borderColor: "rgba(249,115,22,0.3)"
                          } : {
                            color: "#8b949e", background: "transparent", borderColor: "#30363d"
                          }}
                        >
                          📄 {s.name}
                        </button>
                      ))}
                    </div>
                    {sheet && (
                      <div className="flex flex-wrap gap-1">
                        {sheet.columns.slice(0, 10).map((col, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: "rgba(139,148,158,0.1)", color: "#8b949e" }}>
                            {col}
                          </span>
                        ))}
                        {sheet.columns.length > 10 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ color: "#8b949e" }}>
                            +{sheet.columns.length - 10}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Task textarea */}
                <p className="text-[11px] font-mono mb-1.5 flex items-center gap-1.5" style={{ color: "#8b949e" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 2.5h7M1.5 5h5.5M1.5 7.5h3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                  {t.taskLabel}
                </p>
                <textarea
                  data-testid="input-task"
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  onKeyDown={e => { if (e.ctrlKey && e.key === "Enter") handleProcess(); }}
                  placeholder={t.taskPlaceholder}
                  disabled={isLoading}
                  className="w-full rounded-lg text-sm leading-relaxed resize-none outline-none transition-all border"
                  style={{
                    background: "#1c2128",
                    borderColor: "#30363d",
                    color: "#e6edf3",
                    padding: "10px 12px",
                    height: "90px",
                    fontFamily: "Inter, system-ui, sans-serif",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = "rgba(249,115,22,0.5)"}
                  onBlur={e => e.currentTarget.style.borderColor = "#30363d"}
                />

                {/* Model selector */}
                <div className="flex items-center gap-2 mt-3 mb-3">
                  <span className="text-[11px] font-mono flex-shrink-0" style={{ color: "#8b949e" }}>{t.modelLabel}</span>
                  <select
                    data-testid="select-model"
                    value={modelId}
                    onChange={e => setModelId(e.target.value)}
                    disabled={isLoading}
                    className="flex-1 rounded-lg text-[11px] font-mono px-2 py-1.5 outline-none border cursor-pointer"
                    style={{ background: "#1c2128", borderColor: "#30363d", color: "#e6edf3" }}
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id} disabled={!m.available}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] font-mono px-2 py-1 rounded border flex-shrink-0" style={{ color: "#f97316", background: "rgba(249,115,22,0.1)", borderColor: "rgba(249,115,22,0.25)" }}>
                    OpenRouter
                  </span>
                </div>

                {/* Process button */}
                <button
                  data-testid="button-process"
                  onClick={handleProcess}
                  disabled={!file || !task.trim() || isLoading}
                  className="w-full rounded-xl font-mono text-sm font-semibold py-2.5 flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: (!file || !task.trim() || isLoading) ? "#1c2128" : "#f97316",
                    color: (!file || !task.trim() || isLoading) ? "#8b949e" : "#fff",
                    cursor: (!file || !task.trim() || isLoading) ? "not-allowed" : "pointer",
                  }}
                >
                  {isLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: "#8b949e", borderTopColor: "#e6edf3" }} />
                      Обрабатываю...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3.2 3.2l1.4 1.4M9.4 9.4l1.4 1.4M3.2 10.8l1.4-1.4M9.4 4.6l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      {t.processBtn}
                    </>
                  )}
                </button>
                <p className="text-[10px] text-center mt-1.5" style={{ color: "#8b949e" }}>{t.processHint}</p>

              </div>
            </div>

            {/* Examples */}
            <div className="rounded-xl border overflow-hidden" style={{ background: "#161b22", borderColor: "#30363d" }}>
              <div className="px-4 py-2.5 border-b flex items-center gap-2 font-mono text-xs font-semibold" style={{ borderColor: "#30363d", color: "#8b949e" }}>
                {t.examplesTitle}
              </div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    data-testid={`example-${i}`}
                    onClick={() => { setTask(ex.task); if (!file) fileInputRef.current?.click(); }}
                    className="p-3 flex items-start gap-2.5 text-left transition-all border-r border-b"
                    style={{ borderColor: "#30363d" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1c2128")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">{ex.emoji}</span>
                    <div>
                      <p className="text-xs font-semibold mb-0.5" style={{ color: "#e6edf3" }}>{ex.title}</p>
                      <p className="text-[10px] leading-relaxed" style={{ color: "#8b949e" }}>{ex.task.slice(0, 50)}…</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Result ────────────────────────────────────── */}
          <div className="rounded-xl border overflow-hidden flex flex-col" style={{ background: "#161b22", borderColor: "#30363d", minHeight: "560px" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#30363d" }}>
              <div className="flex items-center gap-2 font-mono text-xs font-semibold" style={{ color: "#8b949e" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 4.5h6M3.5 7h4.5M3.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                {t.panelResultTitle}
              </div>
              {status === "done" && downloadUrl && (
                <button
                  data-testid="button-download-header"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all"
                  style={{ color: "#f97316", borderColor: "rgba(249,115,22,0.4)", background: "transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(249,115,22,0.1)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v6.5M2.5 5.5l3 3 3-3M1 9.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {t.downloadBtn}
                </button>
              )}
            </div>

            <div className="flex-1 flex flex-col">

              {/* Empty state */}
              {status === "idle" && !analysis && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-12" style={{ color: "#8b949e" }}>
                  <div className="w-14 h-14 rounded-2xl grid place-items-center text-3xl border" style={{ background: "#1c2128", borderColor: "#30363d" }}>📂</div>
                  <p className="text-base font-semibold" style={{ color: "#e6edf3" }}>{t.idleTitle}</p>
                  <p className="text-xs text-center max-w-xs leading-relaxed">{t.idleSub}</p>
                  <div className="flex gap-2.5 mt-2">
                    {[t.idleStep1, t.idleStep2, t.idleStep3].map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] border" style={{ borderColor: "#30363d", background: "#1c2128" }}>
                        <div className="w-4 h-4 rounded-full grid place-items-center text-[9px] font-bold" style={{ background: "#30363d" }}>{i + 1}</div>
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Idle with file */}
              {status === "idle" && analysis && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-12" style={{ color: "#8b949e" }}>
                  <div className="w-14 h-14 rounded-2xl grid place-items-center text-3xl border" style={{ background: "rgba(249,115,22,0.1)", borderColor: "rgba(249,115,22,0.3)" }}>📊</div>
                  <p className="text-base font-semibold" style={{ color: "#e6edf3" }}>{t.fileLoadedTitle}</p>
                  <p className="text-xs text-center max-w-xs leading-relaxed">{t.fileLoadedSub}</p>
                </div>
              )}

              {/* Loading state */}
              {status === "processing" && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12">
                  <div className="w-9 h-9 rounded-full border-2 animate-spin" style={{ borderColor: "#30363d", borderTopColor: "#f97316" }} />
                  <div className="flex flex-col gap-2 w-64">
                    {LOADING_STEPS.map((step, i) => {
                      const done = loadingStep > i + 1;
                      const active = loadingStep === i + 1;
                      return (
                        <div key={i} className="flex items-center gap-2.5 text-xs font-mono transition-colors duration-300"
                          style={{ color: done ? "#00D084" : active ? "#f97316" : "#8b949e" }}>
                          <span className="text-sm w-4 text-center">{done ? "✓" : active ? "⟳" : "○"}</span>
                          {step}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Error state */}
              {status === "error" && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-12">
                  <div className="w-14 h-14 rounded-2xl grid place-items-center text-3xl border" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }}>⚠️</div>
                  <p className="text-base font-semibold" style={{ color: "#e6edf3" }}>{t.errorTitle}</p>
                  <p className="text-xs text-center max-w-sm p-3 rounded-lg border leading-relaxed" style={{ color: "#f87171", background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" }}>{errorMsg}</p>
                  <button onClick={() => setStatus("idle")} className="text-xs font-mono px-4 py-2 rounded-lg border transition-all" style={{ color: "#8b949e", borderColor: "#30363d" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1c2128")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    Попробовать снова
                  </button>
                </div>
              )}

              {/* Done: result */}
              {status === "done" && (
                <div className="flex-1 flex flex-col">
                  {/* Summary */}
                  <div className="px-4 py-3 border-b" style={{ borderColor: "#30363d" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: "#e6edf3" }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#00D084" strokeWidth="1.3"/><path d="M4.5 7l2 2 3-3" stroke="#00D084" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        {t.doneTitle}
                      </div>
                      {usedModelLabel && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: "#1c2128", color: "#8b949e", border: "1px solid #30363d" }}>
                          {usedModelLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: "#8b949e" }}>
                      {changes.length > 0
                        ? t.doneChanges(changes.length)
                        : t.doneFallback}
                    </p>
                  </div>

                  {/* Changes list */}
                  {changes.length > 0 && (
                    <div className="px-4 py-3 border-b flex flex-col gap-2.5" style={{ borderColor: "#30363d" }}>
                      {changes.map((ch, i) => {
                        const style = CHANGE_COLORS[ch.type] || CHANGE_COLORS.modify;
                        return (
                          <div key={i} className="flex items-start gap-2.5 text-xs">
                            <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold flex-shrink-0 mt-0.5 ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                            <div>
                              <p style={{ color: "#e6edf3" }}>{ch.description}</p>
                              {ch.detail && <p className="font-mono text-[10px] mt-0.5" style={{ color: "#8b949e" }}>{ch.detail}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Table preview */}
                  {sheet && (
                    <div className="flex-1 p-4 overflow-auto">
                      <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "#8b949e" }}>
                        Превью исходных данных · {sheet.name}
                      </p>
                      <div className="overflow-auto rounded-lg border" style={{ borderColor: "#30363d" }}>
                        <table className="w-full text-[11px] font-mono border-collapse">
                          <thead>
                            <tr>
                              {sheet.columns.map((col, i) => (
                                <th key={i} className="text-left px-3 py-2 border-b border-r whitespace-nowrap font-semibold" style={{ background: "#1c2128", borderColor: "#30363d", color: "#8b949e" }}>
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sheet.sample.map((row, ri) => (
                              <tr key={ri} className="border-b" style={{ borderColor: "#30363d" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#1c2128")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-3 py-2 border-r whitespace-nowrap" style={{ borderColor: "#30363d", color: "#e6edf3" }}>
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Download section */}
                  <div className="px-4 py-3 border-t flex items-center gap-3" style={{ borderColor: "#30363d" }}>
                    <div className="flex-1">
                      <p className="text-xs font-mono font-semibold" style={{ color: "#f97316" }}>{downloadName}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "#8b949e" }}>{t.downloadReady}</p>
                    </div>
                    <button
                      data-testid="button-download"
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-5 py-2 rounded-lg font-mono text-sm font-semibold text-white transition-all"
                      style={{ background: "#f97316" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#ea6c0a")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#f97316")}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5v7M3.5 6l3 3 3-3M1 11h11" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {t.downloadBtn}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
