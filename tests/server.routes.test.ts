import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as routes from '../server/routes.js';

const { registerRoutes } = routes;

const createTempFile = async (suffix: string, content = '') => {
  const filePath = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
};

describe('server routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    registerRoutes({} as any, app);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  test('GET /api/models returns available models', async () => {
    const response = await request(app).get('/api/models');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.some((item: any) => item.id === 'deepseek_v3')).toBe(true);
  });

  test('POST /api/analyze-file returns 400 when no file is uploaded', async () => {
    const response = await request(app).post('/api/analyze-file');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'No file uploaded' });
  });

  test('POST /api/process-file returns 400 when files are missing', async () => {
    const filePath = await createTempFile('.xlsx', 'dummy');
    const response = await request(app)
      .post('/api/process-file')
      .field('task', 'Do something');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'No file uploaded' });
    await fs.unlink(filePath).catch(() => {});
  });

  test('POST /api/process-file returns 400 when task is empty', async () => {
    const filePath = await createTempFile('.xlsx', 'dummy');
    const response = await request(app)
      .post('/api/process-file')
      .attach('file', filePath, 'sample.xlsx');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Task is required' });
    await fs.unlink(filePath).catch(() => {});
  });

  test('POST /api/process-file returns file data when dependencies succeed', async () => {
    const analyzeMock = vi.spyOn(routes.runtime, 'pyAnalyze').mockResolvedValue({ ok: true, sheets: [{ name: 'Sheet1', columns: ['A'], row_count: 0, sample: [] }] });
    const llmMock = vi.spyOn(routes.runtime, 'callLLM').mockResolvedValue('changes.append({"type":"modify","description":"done","detail":"ok"})');
    const executeMock = vi.spyOn(routes.runtime, 'pyExecute').mockImplementation(async (_inputPath, outputPath) => {
      await fs.writeFile(outputPath, 'dummy file content', 'utf8');
      return { ok: true, changes: [{ type: 'modify', description: 'done', detail: 'ok' }] };
    });

    const filePath = await createTempFile('.xlsx', 'dummy');
    const response = await request(app)
      .post('/api/process-file')
      .field('task', 'Update workbook')
      .field('modelId', 'deepseek_v3')
      .attach('file', filePath, 'sample.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.filename).toBe('sample_updated.xlsx');
    expect(Array.isArray(response.body.changes)).toBe(true);
    expect(response.body.changes).toEqual([{ type: 'modify', description: 'done', detail: 'ok' }]);
    expect(typeof response.body.file).toBe('string');

    analyzeMock.mockRestore();
    llmMock.mockRestore();
    executeMock.mockRestore();
    await fs.unlink(filePath).catch(() => {});
  });
});
