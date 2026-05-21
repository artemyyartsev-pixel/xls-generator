# API Specification XLS Generator

## Обзор
API предоставляет endpoints для анализа и обработки Excel-файлов с использованием AI.

## Endpoints

### GET /api/models
- **Описание**: Возвращает список доступных LLM-моделей.
- **Ответ**:
  ```json
  [
    {
      "id": "deepseek_v3",
      "label": "DeepSeek V3",
      "provider": "openrouter",
      "available": true
    }
  ]
  ```

### POST /api/analyze-file
- **Описание**: Анализирует структуру Excel-файла.
- **Тело**: multipart/form-data с полем `file`.
- **Ответ**:
  ```json
  {
    "filename": "example.xlsx",
    "size": 1024000,
    "sheets": [
      {
        "name": "Sheet1",
        "columns": ["Column1", "Column2"],
        "row_count": 100,
        "sample": [["data1", "data2"]]
      }
    ],
    "tempPath": "/tmp/file"
  }
  ```

### POST /api/process-files
- **Описание**: Обрабатывает несколько файлов с заданной задачей.
- **Тело**: multipart/form-data с полями `files[]`, `task`, `modelId`.
- **Ответ**:
  ```json
  {
    "ok": true,
    "filename": "batch_results.zip",
    "files": [
      {
        "originalName": "file1.xlsx",
        "outputName": "file1_updated.xlsx",
        "changes": [{"type": "add", "description": "Added column"}],
        "error": null
      }
    ],
    "archive": "base64encodedzip"
  }
  ```

## Ошибки
- 400: Bad Request (например, нет файла или задачи).
- 422: Unprocessable Entity (ошибка обработки).
- 500: Internal Server Error.

## Аутентификация
Требуется `OPENROUTER_API_KEY` в переменных окружения.