export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  // Owner of the latest event, including null.
  owner: string | null;
  // Every valid event counts as a run; retry events also count as retries.
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  // Most recent supplied error, retained even after a successful event.
  lastError: string | null;
  // Chronological bounds, with the original timestamp offsets preserved.
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
};

// Rows are sorted by job. Missing or invalid night names return null; other I/O errors throw.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;

export { readNight } from './reader.js';
