import pool from "./db";
import { randomUUID } from "crypto";

// Cost per 1M tokens (in cents)
const MODEL_COSTS = {
  "claude-opus-4-5-20251101": { input: 1500, output: 7500 },
  "claude-3-5-haiku-20241022": { input: 25, output: 125 },
  "gpt-5.1": { input: 200, output: 800 },
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },
} as const;

type ModelName = keyof typeof MODEL_COSTS;

interface LogMetricParams {
  endpoint: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  success?: boolean;
  errorType?: string | null;
  sessionId?: string | null;
}

export async function logApiMetric({
  endpoint,
  model,
  latencyMs,
  inputTokens = 0,
  outputTokens = 0,
  success = true,
  errorType = null,
  sessionId = null,
}: LogMetricParams): Promise<void> {
  try {
    const id = randomUUID();

    // Calculate cost
    const modelKey = model as ModelName;
    const costs = MODEL_COSTS[modelKey] || { input: 0, output: 0 };
    const costCents = (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;

    await pool.execute(
      `INSERT INTO api_metrics (id, endpoint, model, latency_ms, input_tokens, output_tokens, cost_cents, success, error_type, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, endpoint, model, latencyMs, inputTokens, outputTokens, costCents, success, errorType, sessionId]
    );
  } catch (error) {
    // Don't let metrics logging break the main request
    console.error("Failed to log metric:", error);
  }
}

export async function logUserEvent(
  sessionId: string,
  eventType: string,
  eventData?: Record<string, unknown>,
  page?: string
): Promise<void> {
  try {
    const id = randomUUID();
    await pool.execute(
      `INSERT INTO user_events (id, session_id, event_type, event_data, page)
       VALUES (?, ?, ?, ?, ?)`,
      [id, sessionId, eventType, eventData ? JSON.stringify(eventData) : null, page || null]
    );
  } catch (error) {
    console.error("Failed to log user event:", error);
  }
}

export async function getOrCreateSession(
  sessionId: string | null,
  userAgent?: string,
  ipHash?: string
): Promise<string> {
  const id = sessionId || randomUUID();

  try {
    // Try to update existing session
    const [result] = await pool.execute(
      `UPDATE sessions SET last_activity = NOW() WHERE id = ?`,
      [id]
    ) as [{ affectedRows: number }, unknown];

    // If no session exists, create one
    if ((result as { affectedRows: number }).affectedRows === 0) {
      await pool.execute(
        `INSERT INTO sessions (id, user_agent, ip_hash) VALUES (?, ?, ?)`,
        [id, userAgent || null, ipHash || null]
      );
    }
  } catch (error) {
    console.error("Failed to get/create session:", error);
  }

  return id;
}

export async function incrementSessionCounter(
  sessionId: string,
  counter: "trees_generated" | "nodes_clicked" | "compare_views"
): Promise<void> {
  try {
    await pool.execute(
      `UPDATE sessions SET ${counter} = ${counter} + 1, last_activity = NOW() WHERE id = ?`,
      [sessionId]
    );
  } catch (error) {
    console.error("Failed to increment session counter:", error);
  }
}
