// SSE event-stream reader shared by every "generate" caller (smart-workflow,
// deliverable-workspace, quick-generate-wizard). Consumes the
// `data: {...}\n\n` framing produced by every /api/projects/.../generate
// route and dispatches delta / done / error to the caller.

export type StreamCallbacks = {
  onDelta?: (delta: string) => void;
  onDone?: (payload: Record<string, unknown>) => void;
};

export async function streamGenerate(
  path: string,
  cb: StreamCallbacks = {},
): Promise<void> {
  const res = await fetch(path, { method: "POST" });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (typeof payload.delta === "string") cb.onDelta?.(payload.delta);
      if (payload.error) throw new Error(String(payload.error));
      if (payload.done) {
        cb.onDone?.(payload);
        return;
      }
    }
  }
}
