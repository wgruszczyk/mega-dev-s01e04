import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const fixtureDirs: string[] = [];

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

function writeNight(lines: string[]) {
  writeFileSync(join(config.runsDir, `${night}.jsonl`), lines.join('\n'));
}

function run() {
  return JSON.stringify({
    at: '2026-10-28T23:00:00+01:00',
    job: 'lane/sync',
    status: 'ok',
    owner: 'rook',
  });
}

beforeEach(() => {
  config.runsDir = mkdtempSync(join(process.cwd(), '.digest-routes-test-'));
  fixtureDirs.push(config.runsDir);
});

afterEach(() => {
  for (const directory of fixtureDirs.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe('GET /digest/:night', () => {
  it('renders a night with run rows', async () => {
    writeNight([run()]);

    const response = await createApp(config).request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('rook');
    expect(html).toContain('2026-10-28T23:00:00+01:00');
  });

  it('returns 404 when the night file is missing', async () => {
    const response = await createApp(config).request(`/digest/${night}`);

    expect(response.status).toBe(404);
  });

  it('renders an empty night', async () => {
    writeNight([]);

    const response = await createApp(config).request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('renders valid rows when a line is malformed', async () => {
    writeNight(['{broken', run()]);

    const response = await createApp(config).request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('lane/sync');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night rows as JSON', async () => {
    writeNight([run()]);

    const response = await createApp(config).request(`/api/digest/${night}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rows: [{
        job: 'lane/sync',
        owner: 'rook',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-28T23:00:00+01:00',
        lastAt: '2026-10-28T23:00:00+01:00',
      }],
      badLines: 0,
    });
  });

  it('returns 404 when the night file is missing', async () => {
    const response = await createApp(config).request(`/api/digest/${night}`);

    expect(response.status).toBe(404);
  });

  it('returns an empty digest for an empty night', async () => {
    writeNight([]);

    const response = await createApp(config).request(`/api/digest/${night}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rows: [], badLines: 0 });
  });

  it('counts malformed lines and returns valid rows', async () => {
    writeNight(['{broken', run()]);

    const response = await createApp(config).request(`/api/digest/${night}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      rows: [{ job: 'lane/sync' }],
      badLines: 1,
    });
  });
});
