// Thin wrapper around the Claude Agent SDK. Each call to `runAgent` spins up an
// independent Claude "sub-agent" (its own context) with web tools, runs it to
// completion, and returns the final text. The orchestrator in index.ts composes
// these into the discover -> write pipeline.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { MODEL } from "./config.js";

export interface RunOptions {
  system: string;
  prompt: string;
  /** Tools the sub-agent may use. Web tools only by default — no filesystem access. */
  allowedTools?: string[];
  maxTurns?: number;
  model?: string;
}

export async function runAgent(opts: RunOptions): Promise<string> {
  const response = query({
    prompt: opts.prompt,
    options: {
      model: opts.model || MODEL,
      systemPrompt: opts.system,
      allowedTools: opts.allowedTools ?? ["WebSearch", "WebFetch"],
      permissionMode: "bypassPermissions", // non-interactive; no file writes are granted anyway
      maxTurns: opts.maxTurns ?? 24,
    },
  });

  let finalText = "";
  for await (const message of response) {
    if (message.type === "result") {
      // SDKResultMessage carries the final text in `result` on success.
      finalText = (message as any).result ?? finalText;
    } else if (message.type === "assistant") {
      // Fallback: accumulate assistant text blocks in case no result text is set.
      const blocks = (message as any).message?.content ?? [];
      for (const b of blocks) if (b.type === "text") finalText = b.text;
    }
  }
  return finalText.trim();
}

/**
 * Extract the first JSON value (object or array) from a model response, tolerating
 * accidental prose or ```json fences around it.
 */
export function extractJson<T = unknown>(text: string): T {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  // Find the first balanced { } or [ ] block.
  const start = t.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in agent response");
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1)) as T;
    }
  }
  throw new Error("Unbalanced JSON in agent response");
}
