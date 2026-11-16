"use client";

import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef } from "react";
import { type Question, RunEvent, type RunId } from "@/lib/research/events";
import { addEvents, type LiveRun, startLiveRun } from "./live-run";

/**
 * The run as the server rendered it, kept up to date over Server-Sent Events while it
 * is running. A burst of events becomes one render per frame.
 */
export function useLiveRun(initial: {
  runId: RunId;
  question: Question;
  events: readonly RunEvent[];
}): LiveRun {
  const router = useRouter();
  const [run, add] = useReducer(addEvents, initial, (start) =>
    startLiveRun(start.runId, start.question, start.events),
  );
  const { runId } = initial;
  const running = run.view.status === "running";
  const lastSeq = useRef(run.view.lastSeq);
  lastSeq.current = run.view.lastSeq;
  const wasRunning = useRef(running);

  useEffect(() => {
    if (!running) return;
    const source = new EventSource(
      `/runs/${encodeURIComponent(runId)}/events?after=${lastSeq.current}`,
    );
    let buffer: RunEvent[] = [];
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      const batch = buffer;
      buffer = [];
      add(batch);
    };
    source.onmessage = (message) => {
      const event = RunEvent.safeParse(JSON.parse(message.data));
      if (!event.success) return;
      buffer.push(event.data);
      frame ??= requestAnimationFrame(flush);
    };
    return () => {
      source.close();
      if (frame !== null) cancelAnimationFrame(frame);
      if (buffer.length > 0) add(buffer);
    };
  }, [running, runId]);

  // The history in the sidebar is rendered by the server, so it learns of the end here.
  useEffect(() => {
    if (wasRunning.current && !running) router.refresh();
    wasRunning.current = running;
  }, [running, router]);

  return run;
}
