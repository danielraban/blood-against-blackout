const CRISIS_PATTERN =
  /\b(suicid(?:e|al)|kill(?:ing)? myself|want to die|end my life|overdos(?:e|ing)|self[-\s]harm)\b/i;

export function isCrisisAsk(text: string) {
  return CRISIS_PATTERN.test(text.trim());
}

export function latestUserText(messages: unknown[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    if (record.role !== "user") continue;
    if (typeof record.content === "string") return record.content.trim();
    if (!Array.isArray(record.parts)) continue;
    return record.parts
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const item = part as Record<string, unknown>;
        return item.type === "text" && typeof item.text === "string" ? item.text : "";
      })
      .join("")
      .trim();
  }
  return "";
}
