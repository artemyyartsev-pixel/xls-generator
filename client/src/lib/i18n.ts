export type Lang = "ru" | "en";

export const translations = {
  ru: {
    // Header
    headerTitle: "AI Tools для Excel",
    tabVba: "VBA Generator",
    tabXls: "XLS Generator",

    // Hero
    heroBadge: "XLS Generator — Beta",
    heroTitle1: "Загрузите Excel —",
    heroAccent: "получите доработанный файл",
    heroSub: "Опишите задачу на русском. ИИ проанализирует структуру, внесёт изменения и вернёт готовый .xlsx",

    // Left panel
    panelFileTitle: "ФАЙЛ И ЗАДАЧА",
    uploadTitle: "Загрузите Excel файл",
    uploadSub: "Перетащите .xlsx или кликните",
    uploadReplace: "Нажмите чтобы заменить",
    sheetLabel: (sheets: number, rows: number, size: string) =>
      `${sheets} ${sheets === 1 ? "лист" : "листа"} · ${rows} строк · ${size}`,
    taskLabel: "Опишите задачу",
    taskPlaceholder: "Например: добавь колонку «Прибыль» = Сумма × 0.3, выдели красным строки где Статус = «Отменён»...",
    modelLabel: "LLM модель",
    processBtn: "Обработать файл",
    processHint: "Ctrl+Enter для запуска",
    examplesTitle: "ГОТОВЫЕ ПРИМЕРЫ",

    // Examples
    ex1Title: "Сводная колонка",
    ex1Task: "Добавь колонку «Прибыль» = Сумма × 0.3 для всех строк с данными",
    ex2Title: "Подсветка строк",
    ex2Task: "Выдели красным фоном все строки где значение в колонке «Статус» равно «Отменён»",
    ex3Title: "Итоговая строка",
    ex3Task: "Добавь итоговую строку внизу таблицы с суммами числовых колонок и жирным шрифтом",
    ex4Title: "Удалить дубли",
    ex4Task: "Найди и удали строки-дубликаты, оставив первое вхождение",
    ex5Title: "Сортировка",
    ex5Task: "Отсортируй данные по первой колонке с датой от новых к старым",

    // Right panel — idle
    panelResultTitle: "РЕЗУЛЬТАТ",
    idleTitle: "Готов к обработке",
    idleSub: "Загрузите Excel файл, опишите что нужно сделать — получите готовый файл",
    idleStep1: "Загрузить файл",
    idleStep2: "Описать задачу",
    idleStep3: "Скачать результат",

    // Right panel — file loaded
    fileLoadedTitle: "Файл загружен",
    fileLoadedSub: "Опишите задачу и нажмите «Обработать файл»",

    // Right panel — processing
    processingSteps: [
      "Загрузка файла...",
      "Анализ структуры...",
      "ИИ генерирует код...",
      "Применяем изменения...",
    ],

    // Right panel — done
    doneTitle: "Изменения внесены успешно",
    doneChanges: (n: number) =>
      `Выполнено ${n} ${n === 1 ? "действие" : n < 5 ? "действия" : "действий"}`,
    doneFallback: "Файл обработан — скачайте результат",
    downloadReady: "Готов к скачиванию",
    downloadBtn: "Скачать .xlsx",
    structureTitle: "СТРУКТУРА ФАЙЛА",

    // Right panel — error
    errorTitle: "Ошибка обработки",

    // Toasts
    toastAnalysisError: "Ошибка анализа",
    toastProcessError: "Ошибка обработки",
    toastDoneTitle: (model: string) => `Готово! (${model})`,
    toastDoneDesc: (n: number) => `Внесено изменений: ${n}`,
  },

  en: {
    // Header
    headerTitle: "AI Tools for Excel",
    tabVba: "VBA Generator",
    tabXls: "XLS Generator",

    // Hero
    heroBadge: "XLS Generator — Beta",
    heroTitle1: "Upload Excel —",
    heroAccent: "get the improved file",
    heroSub: "Describe your task in plain language. AI will analyze the structure, make changes and return a ready .xlsx file.",

    // Left panel
    panelFileTitle: "FILE & TASK",
    uploadTitle: "Upload Excel file",
    uploadSub: "Drag & drop .xlsx or click",
    uploadReplace: "Click to replace",
    sheetLabel: (sheets: number, rows: number, size: string) =>
      `${sheets} ${sheets === 1 ? "sheet" : "sheets"} · ${rows} rows · ${size}`,
    taskLabel: "Describe the task",
    taskPlaceholder: "E.g.: add a Profit column = Amount × 0.3, highlight rows where Status = 'Cancelled' in red...",
    modelLabel: "LLM model",
    processBtn: "Process file",
    processHint: "Ctrl+Enter to run",
    examplesTitle: "QUICK EXAMPLES",

    // Examples
    ex1Title: "Summary column",
    ex1Task: "Add a 'Profit' column = Amount × 0.3 for all data rows",
    ex2Title: "Highlight rows",
    ex2Task: "Highlight in red all rows where the 'Status' column equals 'Cancelled'",
    ex3Title: "Total row",
    ex3Task: "Add a total row at the bottom of the table with sums of numeric columns in bold",
    ex4Title: "Remove duplicates",
    ex4Task: "Find and remove duplicate rows, keeping the first occurrence",
    ex5Title: "Sort data",
    ex5Task: "Sort data by the first date column from newest to oldest",

    // Right panel — idle
    panelResultTitle: "RESULT",
    idleTitle: "Ready to process",
    idleSub: "Upload an Excel file, describe what to do — get the finished file",
    idleStep1: "Upload file",
    idleStep2: "Describe task",
    idleStep3: "Download result",

    // Right panel — file loaded
    fileLoadedTitle: "File uploaded",
    fileLoadedSub: "Describe the task and click 'Process file'",

    // Right panel — processing
    processingSteps: [
      "Uploading file...",
      "Analyzing structure...",
      "AI generating code...",
      "Applying changes...",
    ],

    // Right panel — done
    doneTitle: "Changes applied successfully",
    doneChanges: (n: number) => `${n} ${n === 1 ? "change" : "changes"} made`,
    doneFallback: "File processed — download the result",
    downloadReady: "Ready to download",
    downloadBtn: "Download .xlsx",
    structureTitle: "FILE STRUCTURE",

    // Right panel — error
    errorTitle: "Processing error",

    // Toasts
    toastAnalysisError: "Analysis error",
    toastProcessError: "Processing error",
    toastDoneTitle: (model: string) => `Done! (${model})`,
    toastDoneDesc: (n: number) => `Changes made: ${n}`,
  },
} as const;

export type Translations = typeof translations.ru;

/** Detect language from browser locale — default RU for Russian speakers */
// CIS country codes — show RU interface
const RU_COUNTRIES = new Set(["RU", "BY", "KZ", "UZ", "TJ", "TM", "KG", "AZ", "AM", "GE", "MD"]);

// Synchronous fallback: browser language while IP lookup is in flight
export function detectLang(): Lang {
  const langs = navigator.languages ?? [navigator.language ?? "ru"];
  for (const l of langs) {
    if (l.toLowerCase().startsWith("ru")) return "ru";
  }
  return "en";
}

// Async IP-based detection — call once on mount
// manualLang: if user already switched manually, skip IP lookup
export async function detectLangByIP(manualLang: Lang | null): Promise<Lang> {
  if (manualLang) return manualLang;
  try {
    const res = await fetch("https://ip-api.com/json/?fields=countryCode", { signal: AbortSignal.timeout(3000) });
    const { countryCode } = await res.json();
    return RU_COUNTRIES.has(countryCode) ? "ru" : "en";
  } catch {
    return detectLang();
  }
}
