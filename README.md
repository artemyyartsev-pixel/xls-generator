# XLS Generator

AI-powered Excel file processor. Upload a `.xlsx` file, describe your task in Russian, and get a modified file back — no VBA, no manual work.

## How It Works

1. **Upload** a `.xlsx` / `.xls` / `.xlsm` file
2. **Describe** what you want (e.g. "add a Profit column = Sum × 0.3, highlight red rows where Status = 'Cancelled'")
3. **Get** a ready-to-download modified Excel file

The AI generates Python/openpyxl code, executes it in a safe sandbox, and returns the modified file.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Python (openpyxl) subprocess
- **LLM**: Multiple models via OpenRouter (DeepSeek V3, DeepSeek R1, GPT-4o mini, Claude Sonnet)

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY

# Start dev server
npm run dev
```

Open http://localhost:5000

## Requirements

- **Node.js 20 LTS** (Node 24 has compatibility issues with better-sqlite3)
- **Python 3.8+** with openpyxl installed:
  ```bash
  pip install openpyxl
  ```

## Environment Variables

```env
OPENROUTER_API_KEY=sk-or-v1-...
```

Get your key at [openrouter.ai/keys](https://openrouter.ai/keys).

## Production Build

```bash
npm run build
PORT=5001 NODE_ENV=production node dist/index.cjs
```

## Supported Models

All models run through OpenRouter (works from Russia without VPN):

| Model | ID |
|---|---|
| DeepSeek V3 | `deepseek/deepseek-chat` |
| DeepSeek R1 | `deepseek/deepseek-r1` |
| GPT-4o mini | `openai/gpt-4o-mini` |
| Claude Sonnet | `anthropic/claude-sonnet-4-5` |

## Part of AI Tools для Excel

This project is one of two independent tools:

- **VBA Generator** — generates VBA macros for Excel automation
- **XLS Generator** — uploads and modifies Excel files directly via Python/openpyxl

Both share a common header with tab-switching navigation.
