import type { Check, Status } from "./checks";

const MARK: Record<Status, string> = {
  pass: "PASS",
  fail: "FAIL",
  warn: "WARN",
  skip: "SKIP",
};

export function renderChecks(checks: readonly Check[]): string {
  const idWidth = Math.max(...checks.map((c) => c.id.length));
  const reqWidth = Math.max(...checks.map((c) => c.requirement.length));
  const lines: string[] = [];
  for (const check of checks) {
    const [first = "", ...rest] = check.evidence;
    lines.push(
      `  ${MARK[check.status]}  ${check.id.padEnd(idWidth)}  ${check.requirement.padEnd(reqWidth)}  ${first}`,
    );
    const indent = " ".repeat(idWidth + reqWidth + 12);
    for (const line of rest) lines.push(`${indent}${line}`);
  }
  return lines.join("\n");
}

export function tally(checks: readonly Check[]): string {
  const n = (s: Status) => checks.filter((c) => c.status === s).length;
  return `${n("pass")} pass, ${n("fail")} fail, ${n("warn")} warn, ${n("skip")} skip`;
}
