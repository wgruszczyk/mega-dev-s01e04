import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';

const night = '2026-10-28';
const fixtureDirs: string[] = [];

function readLines(lines: string[]) {
  const runsDir = mkdtempSync(join(process.cwd(), '.digest-reader-test-'));
  fixtureDirs.push(runsDir);
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
  return readNight(runsDir, night);
}

function run(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    at: '2026-10-28T23:00:00+01:00',
    job: 'lane/sync',
    status: 'ok',
    owner: 'rook',
    ...overrides,
  });
}

afterEach(() => {
  for (const directory of fixtureDirs.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe('readNight', () => {
  it('reads the real night without dropping unowned jobs or the bad line', () => {
    const digest = readNight('runs', night);

    expect(digest).toEqual({
      badLines: 1,
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('returns null for a missing night', () => {
    expect(readNight('runs', '1900-01-01')).toBeNull();
  });

  it('does not resolve night names outside the runs directory', () => {
    expect(readNight('runs', '../2026-10-28')).toBeNull();
  });

  it('does not hide filesystem errors other than a missing file', () => {
    const runsDir = mkdtempSync(join(process.cwd(), '.digest-reader-test-'));
    fixtureDirs.push(runsDir);
    writeFileSync(join(runsDir, 'not-a-directory'), '');

    expect(() => readNight(join(runsDir, 'not-a-directory'), night)).toThrow();
  });

  it('returns no rows for an empty or whitespace-only night', () => {
    expect(readLines([])).toEqual({ rows: [], badLines: 0 });
    expect(readLines(['', '  ', '\r', ''])).toEqual({ rows: [], badLines: 0 });
  });

  it('counts malformed JSON and invalid records while continuing to read', () => {
    const digest = readLines([
      '{broken',
      'null',
      '[]',
      '42',
      '{}',
      run({ at: 'not-a-date' }),
      run({ job: ' ' }),
      run({ status: 'unknown' }),
      run({ owner: 42 }),
      run({ error: false }),
      run({ owner: undefined }),
      run(),
      '{"truncated":',
    ]);

    expect(digest?.badLines).toBe(12);
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].runs).toBe(1);
  });

  it('keeps reading after bad lines and accepts CRLF and a trailing newline', () => {
    const digest = readLines([
      `${run({ status: 'retry', error: 'first error' })}\r`,
      '{broken\r',
      `${run({ at: '2026-10-29T01:00:00+01:00', status: 'fail', error: 'last error' })}\r`,
      '',
    ]);

    expect(digest).toEqual({
      badLines: 1,
      rows: [{
        job: 'lane/sync',
        owner: 'rook',
        runs: 2,
        retries: 1,
        lastStatus: 'fail',
        lastError: 'last error',
        firstAt: '2026-10-28T23:00:00+01:00',
        lastAt: '2026-10-29T01:00:00+01:00',
      }],
    });
  });

  it('uses chronological order while preserving original offsets and the latest owner', () => {
    const digest = readLines([
      run({ at: '2026-10-29T01:00:00+01:00', owner: null }),
      run({ at: '2026-10-29T01:30:00+02:00', status: 'fail', error: 'earlier error' }),
      run({ at: '2026-10-29T00:45:00+01:00', status: 'retry', error: 'latest error' }),
    ]);

    expect(digest?.rows).toEqual([{
      job: 'lane/sync',
      owner: null,
      runs: 3,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'latest error',
      firstAt: '2026-10-29T01:30:00+02:00',
      lastAt: '2026-10-29T01:00:00+01:00',
    }]);
  });

  it('keeps file order when timestamps tie and groups arbitrary job names safely', () => {
    const digest = readLines([
      run({ job: '__proto__', status: 'retry', error: 'retry error' }),
      run({ job: '__proto__', owner: null }),
      run({ job: 'constructor' }),
    ]);

    expect(digest?.badLines).toBe(0);
    expect(digest?.rows).toHaveLength(2);
    expect(digest?.rows.find((row) => row.job === '__proto__')).toEqual({
      job: '__proto__',
      owner: null,
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'retry error',
      firstAt: '2026-10-28T23:00:00+01:00',
      lastAt: '2026-10-28T23:00:00+01:00',
    });
  });
});
