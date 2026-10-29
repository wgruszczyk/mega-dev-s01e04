import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type Run = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRun(value: unknown): value is Run {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Record<string, unknown>;

  return (
    typeof run.at === 'string' &&
    Number.isFinite(Date.parse(run.at)) &&
    typeof run.job === 'string' &&
    run.job.trim().length > 0 &&
    (run.status === 'ok' || run.status === 'retry' || run.status === 'fail') &&
    (typeof run.owner === 'string' || run.owner === null) &&
    (run.error === undefined || typeof run.error === 'string')
  );
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const runs: Run[] = [];
  let badLines = 0;

  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;

    try {
      const value: unknown = JSON.parse(line);
      if (isRun(value)) runs.push(value);
      else badLines++;
    } catch {
      badLines++;
    }
  }

  runs.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const rows = new Map<string, DigestRow>();

  for (const run of runs) {
    const row = rows.get(run.job);
    if (!row) {
      rows.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }

    row.owner = run.owner;
    row.runs++;
    if (run.status === 'retry') row.retries++;
    row.lastStatus = run.status;
    if (run.error !== undefined) row.lastError = run.error;
    row.lastAt = run.at;
  }

  return {
    rows: [...rows.values()].sort((a, b) => a.job.localeCompare(b.job)),
    badLines,
  };
};
