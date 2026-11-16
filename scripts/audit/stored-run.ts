import { DatabaseSync } from "node:sqlite";

// The audit reads SQLite directly and types the events itself, so a bug in the app's event
// schema or store cannot hide a broken run from it.

export type Failure = { kind: string; detail: string };

type Shapes = {
  "run.started": { limits: Record<string, number> };
  "round.started": { round: number; queries: { query: string }[] };
  "decodo.requested": {
    call: number;
    round: number;
    endpoint: string;
    input: string;
  };
  "decodo.settled": {
    call: number;
    outcome: string;
    detail: string | null;
    durationMs: number;
  };
  "search.finished": {
    round: number;
    query: { query: string };
    outcome:
      | { status: "ok"; results: { url: string }[] }
      | { status: "failed"; failure: Failure };
  };
  "select.finished": { round: number; picked: string[] };
  "map.finished": { round: number; site: string };
  "reads.planned": {
    round: number;
    granted: string[];
    refused: { url: string; reason: string }[];
  };
  "reads.queued": {
    round: number;
    queue: string[];
    skipped: { url: string; reason: string }[];
  };
  "reads.finished": {
    round: number;
    skipped: { url: string; reason: string }[];
  };
  "page.read": { round: number; url: string; title: string; chars: number };
  "page.failed": { round: number; url: string; failure: Failure };
  "page.extracted": { url: string; label: string; drafts: number };
  "page.extract-failed": { url: string; message: string };
  "claim.verified": {
    number: number;
    url: string;
    statement: string;
    quote: string;
  };
  "claim.dropped": {
    url: string;
    statement: string;
    quote: string;
    failed: string;
    reason: string;
  };
  "gap.checked": { round: number; answered: boolean };
  "run.error": { step: string; message: string };
  "report.delta": { text: string };
  "report.finished": { writtenBy: string; markdown: string; cited: number[] };
  "run.finished": { end: { status: string; stoppedBy?: string } };
};

export type EventType = keyof Shapes;
export type Envelope = { seq: number; at: number; type: string };
export type Ev<K extends EventType> = Shapes[K] & Envelope & { type: K };

export type RunRow = {
  id: string;
  question: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
};

export type StoredRun = {
  run: RunRow;
  events: readonly Envelope[];
  pages: ReadonlyMap<string, string>;
};

export function eventsOf<K extends EventType>(
  stored: Pick<StoredRun, "events">,
  type: K,
): Ev<K>[] {
  return stored.events.filter((e) => e.type === type) as Ev<K>[];
}

export type RoundReads = {
  round: number;
  at: number;
  attempted: string[];
  skipped: { url: string; reason: string }[];
};

// A run stored before the read-attempt rule (B7) logs `reads.planned` once per round. A later
// run logs `reads.queued` and `reads.finished`. The attempted pages come from the Decodo
// requests in both cases, so the audit does not trust either event for them.
export function readsOf(stored: Pick<StoredRun, "events">): RoundReads[] {
  const rounds = new Map<number, RoundReads>();
  const roundOf = (round: number, at: number) => {
    const known = rounds.get(round);
    if (known) return known;
    const created = { round, at, attempted: [], skipped: [] };
    rounds.set(round, created);
    return created;
  };
  // The planning events come first, so the reads of a round start at them.
  for (const type of [
    "reads.planned",
    "reads.queued",
    "reads.finished",
  ] as const) {
    for (const event of eventsOf(stored, type)) {
      roundOf(event.round, event.at).skipped.push(
        ...("refused" in event ? event.refused : event.skipped),
      );
    }
  }
  for (const request of eventsOf(stored, "decodo.requested")) {
    if (request.endpoint !== "universal") continue;
    const reads = roundOf(request.round, request.at);
    if (!reads.attempted.includes(request.input))
      reads.attempted.push(request.input);
  }
  return [...rounds.values()].sort((a, b) => a.round - b.round);
}

export function databasePath(
  flag: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  if (flag) return flag;
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run `pnpm bootstrap`, or pass --db <path>.",
    );
  }
  return url.replace(/^file:/, "");
}

export function openReadOnly(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: true });
  // The app writes in journal mode "delete"; a reader without a timeout fails while it writes.
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

export function resolveRunId(db: DatabaseSync, idOrLatest: string): string {
  if (idOrLatest !== "latest") return idOrLatest;
  const row = db
    .prepare("SELECT id FROM Run ORDER BY createdAt DESC LIMIT 1")
    .get() as { id: string } | undefined;
  if (!row) throw new Error("The database holds no run.");
  return row.id;
}

export function loadStoredRun(db: DatabaseSync, runId: string): StoredRun {
  const run = db
    .prepare(
      "SELECT id, question, status, createdAt, finishedAt FROM Run WHERE id = ?",
    )
    .get(runId) as RunRow | undefined;
  if (!run) throw new Error(`No run with the ID ${runId}.`);
  const rows = db
    .prepare("SELECT seq, at, data FROM RunEvent WHERE runId = ? ORDER BY seq")
    .all(runId) as { seq: number; at: string; data: string }[];
  const events = rows.map((row) => ({
    ...(JSON.parse(row.data) as { type: string }),
    seq: row.seq,
    at: Date.parse(row.at),
  }));
  const pages = new Map(
    (
      db
        .prepare("SELECT url, markdown FROM PageText WHERE runId = ?")
        .all(runId) as { url: string; markdown: string }[]
    ).map((row) => [row.url, row.markdown]),
  );
  return { run: { ...run }, events, pages };
}
