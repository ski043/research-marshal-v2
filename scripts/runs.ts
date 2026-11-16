import { listRuns, loadRunRecord } from "@/lib/research";
import { RunId } from "@/lib/research/events";
import { formatList, formatShow, type ListRow } from "@/lib/research/inspect";

const USAGE = `Usage:
  pnpm runs list                         every stored run, newest first
  pnpm runs show <run id | latest>       one run for a human
  pnpm runs show <run id | latest> --all also list every skipped page
  pnpm runs show <run id | latest> --json
      the whole run as JSON: the RunRecord type in lib/research/index.ts
      ({ summary: RunSummary, view: RunView, events: RunEvent[] })
  pnpm runs show <run id | latest> --report
      only the report Markdown, exactly as stored

Use pnpm -s (silent) when a script reads the output, so pnpm prints no header.
Exit codes: 0 done, 1 no such run or no report, 2 usage error.`;

function fail(code: 1 | 2, message: string): never {
  console.error(message);
  process.exit(code);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function list(): Promise<void> {
  const rows: ListRow[] = [];
  for (const summary of await listRuns()) {
    try {
      const record = await loadRunRecord(summary.runId);
      if (record) rows.push({ ok: true, record });
    } catch (error) {
      rows.push({ ok: false, summary, error: message(error) });
    }
  }
  console.log(formatList(rows));
}

async function show(target: string, flags: Set<string>): Promise<void> {
  let runId = RunId.parse(target);
  if (target === "latest") {
    const latest = (await listRuns())[0];
    if (!latest) fail(1, "No runs yet.");
    runId = latest.runId;
  }
  let record: Awaited<ReturnType<typeof loadRunRecord>>;
  try {
    record = await loadRunRecord(runId);
  } catch (error) {
    fail(1, `The events of run ${runId} do not replay: ${message(error)}`);
  }
  if (!record) fail(1, `No run with the id ${runId}.`);

  if (flags.has("--json")) {
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } else if (flags.has("--report")) {
    const { report } = record.view;
    if (report?.kind !== "final") {
      fail(1, `Run ${runId} has no report: the run is ${record.view.status}.`);
    }
    process.stdout.write(report.markdown);
  } else {
    console.log(formatShow(record, { all: flags.has("--all") }));
  }
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((arg) => arg.startsWith("--")));
const positional = rest.filter((arg) => !arg.startsWith("--"));
const known = new Set(["--json", "--report", "--all"]);
const unknown = [...flags].filter((flag) => !known.has(flag));
const outputs = ["--json", "--report"].filter((flag) => flags.has(flag));

if (command === "list" && rest.length === 0) {
  await list();
} else if (
  command === "show" &&
  positional.length === 1 &&
  unknown.length === 0 &&
  outputs.length <= 1 &&
  !(flags.has("--all") && outputs.length > 0)
) {
  await show(positional[0] as string, flags);
} else {
  fail(2, USAGE);
}
