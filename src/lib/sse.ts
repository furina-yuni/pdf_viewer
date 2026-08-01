type EventHandler = (event: string, data: Record<string, unknown>) => void;

export async function streamSse(
  url: string,
  body: object,
  signal: AbortSignal,
  onEvent: EventHandler,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("스트리밍 응답을 읽을 수 없습니다.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      const dataLine = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (event && dataLine) onEvent(event, JSON.parse(dataLine));
    }
  }
}

