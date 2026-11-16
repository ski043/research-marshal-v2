"use client";

import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import type { Question, RunEvent, RunId } from "@/lib/research/events";
import { addEvents, type LiveRun, startLiveRun } from "./live-run";

const RETRY_MS = 2_000;

/**
 * The run as the server rendered it, kept up to date over Server-Sent Events while it
 * is running. A burst of events becomes one render per frame.
 */
export function useLiveRun(initial: {
  runId: RunId;
  question: Question;
  events: readonly RunEvent[];
}): LiveRun & { connectionLost: boolean } {
  const router = useRouter();
  const [run, add] = useReducer(addEvents, initial, (start) =>
    startLiveRun(start.runId, start.question, start.events),
  );
  const { runId } = initial;
  const running = run.view.status === "running";
  const lastSeq = useRef(run.view.lastSeq);
  lastSeq.current = run.view.lastSeq;
  const wasRunning = useRef(running);
  const [attempt, setAttempt] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` opens the stream again after it closed for good
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
    let retry: ReturnType<typeof setTimeout> | null = null;
    source.onopen = () => setConnectionLost(false);
    source.onerror = () => {
      // The browser retries a dropped stream by itself. It gives up for good on an
      // answer that is not a stream, for example a 500, and only then is it closed.
      if (source.readyState !== EventSource.CLOSED) return;
      setConnectionLost(true);
      retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
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
      if (retry !== null) clearTimeout(retry);
      flush();
    };
  }, [running, runId, attempt]);

  // The history in the sidebar is rendered by the server, so it learns of the end here.
  useEffect(() => {
    if (wasRunning.current && !running) router.refresh();
    wasRunning.current = running;
  }, [running, router]);

  return { ...run, connectionLost: running && connectionLost };
}
