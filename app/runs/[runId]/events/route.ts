import type { NextRequest } from "next/server";
import { followRun, loadRunSummary } from "@/lib/research";
import { type RunEvent, RunId } from "@/lib/research/events";

const encoder = new TextEncoder();

function cursorOf(request: NextRequest): number {
  const value =
    request.headers.get("last-event-id") ??
    request.nextUrl.searchParams.get("after");
  const seq = Number(value);
  return Number.isInteger(seq) && seq > 0 ? seq : 0;
}

/**
 * The events of one run after a cursor, as Server-Sent Events. The response ends after
 * `run.finished`. 204 tells `EventSource` to stop: nothing can follow the cursor.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/runs/[runId]/events">,
): Promise<Response> {
  const { runId } = await context.params;
  const id = RunId.safeParse(runId);
  const summary = id.success ? await loadRunSummary(id.data) : null;
  if (!id.success || !summary) return new Response(null, { status: 404 });

  const events = followRun(id.data, {
    after: cursorOf(request),
    signal: request.signal,
  })[Symbol.asyncIterator]();
  // A running run answers at once and waits inside the stream. An ended run is read
  // first, so the answer can say that nothing follows.
  let ready: IteratorResult<RunEvent> | null = null;
  if (summary.status !== "running") {
    ready = await events.next();
    if (ready.done) return new Response(null, { status: 204 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = ready ?? (await events.next());
      ready = null;
      if (result.done) {
        controller.close();
        return;
      }
      const event = result.value;
      controller.enqueue(
        encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`),
      );
      if (event.type === "run.finished") controller.close();
    },
    async cancel() {
      await events.return?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
