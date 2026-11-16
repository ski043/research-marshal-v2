import type { RunStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  ModelChoice,
  type PageUrl,
  Question,
  type RunEnd,
  RunEvent,
  RunEventBody,
  RunId,
} from "./events";
import type { RunView } from "./run-view";

export type RunSummary = {
  runId: RunId;
  question: Question;
  model: ModelChoice;
  status: RunView["status"];
  createdAt: Date;
  finishedAt: Date | null;
};

export type Store = {
  createRun(run: { question: Question; model: ModelChoice }): Promise<RunId>;
  appendEvent(runId: RunId, event: RunEvent): Promise<void>;
  readEvents(runId: RunId, afterSeq: number): Promise<readonly RunEvent[]>;
  savePageText(runId: RunId, url: PageUrl, markdown: string): Promise<void>;
  readRun(runId: RunId): Promise<RunSummary | null>;
  listRuns(): Promise<readonly RunSummary[]>;
};

const STATUS_OF_END: Record<RunEnd["status"], RunStatus> = {
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  failed: "FAILED",
};

const VIEW_STATUS: Record<RunStatus, RunView["status"]> = {
  RUNNING: "running",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
};

function summaryOf(row: {
  id: string;
  question: string;
  model: string;
  status: RunStatus;
  createdAt: Date;
  finishedAt: Date | null;
}): RunSummary {
  return {
    runId: RunId.parse(row.id),
    question: Question.parse(row.question),
    model: ModelChoice.parse(row.model),
    status: VIEW_STATUS[row.status],
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

export function openStore(): Store {
  return {
    async createRun({ question, model }) {
      const run = await db.run.create({ data: { question, model } });
      return RunId.parse(run.id);
    },

    async appendEvent(runId, event) {
      const { seq, at, ...body } = event;
      const insert = db.runEvent.create({
        data: { runId, seq, at: new Date(at), data: body },
      });
      if (event.type !== "run.finished") {
        await insert;
        return;
      }
      await db.$transaction([
        insert,
        db.run.update({
          where: { id: runId },
          data: {
            status: STATUS_OF_END[event.end.status],
            finishedAt: new Date(at),
          },
        }),
      ]);
    },

    async readEvents(runId, afterSeq) {
      const rows = await db.runEvent.findMany({
        where: { runId, seq: { gt: afterSeq } },
        orderBy: { seq: "asc" },
      });
      return rows.map((row) =>
        RunEvent.parse({
          ...RunEventBody.parse(row.data),
          seq: row.seq,
          at: row.at.toISOString(),
        }),
      );
    },

    async savePageText(runId, url, markdown) {
      await db.pageText.create({ data: { runId, url, markdown } });
    },

    async readRun(runId) {
      const row = await db.run.findUnique({ where: { id: runId } });
      return row ? summaryOf(row) : null;
    },

    async listRuns() {
      const rows = await db.run.findMany({ orderBy: { createdAt: "desc" } });
      return rows.map(summaryOf);
    },
  };
}
