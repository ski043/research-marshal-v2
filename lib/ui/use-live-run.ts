"use client";

import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef } from "react";
import type { Question, RunEvent, RunId } from "@/lib/research/events";
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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
      frame = null;
      timer = null;
      const batch = buffer;
      buffer = [];
      if (batch.length > 0) add(batch);
    };
    source.onmessage = (message) => {
      // The route sends events that the store parsed, so they are trusted as they are.
      buffer.push(JSON.parse(message.data) as RunEvent);
      frame ??= requestAnimationFrame(flush);
      // A hidden tab gets no animation frame, and the run must still reach its end there.
      timer ??= setTimeout(flush, 250);
    };
    return () => {
      source.close();
      flush();
    };
  }, [running, runId]);

  // The history in the sidebar is rendered by the server, so it learns of the end here.
  useEffect(() => {
    if (wasRunning.current && !running) router.refresh();
    wasRunning.current = running;
  }, [running, router]);

  return run;
}
