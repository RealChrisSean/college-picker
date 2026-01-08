import OpenAI from "openai";
import pool from "./db";
import { RowDataPacket } from "mysql2";

const openai = new OpenAI();

// Generate embedding for text using OpenAI
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

// Format embedding array for TiDB vector storage
export function formatEmbeddingForDB(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

interface SearchResult {
  id: string;
  content: string;
  source: string;
  distance: number;
}

// Search across all user data for relevant context
export async function searchUserContext(
  sessionId: string,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = formatEmbeddingForDB(queryEmbedding);

  const connection = await pool.getConnection();
  const results: SearchResult[] = [];

  try {
    // Search reflection messages
    const [reflections] = await connection.execute<RowDataPacket[]>(
      `SELECT id, content, 'reflection' as source,
              VEC_COSINE_DISTANCE(embedding, ?) as distance
       FROM reflection_messages
       WHERE session_id = ? AND embedding IS NOT NULL
       ORDER BY distance ASC
       LIMIT ?`,
      [embeddingStr, sessionId, limit]
    );
    results.push(...reflections.map(r => ({
      id: r.id,
      content: r.content,
      source: r.source,
      distance: r.distance,
    })));

    // Search journal entries
    const [journals] = await connection.execute<RowDataPacket[]>(
      `SELECT id, CONCAT(title, ': ', content) as content, 'journal' as source,
              VEC_COSINE_DISTANCE(embedding, ?) as distance
       FROM journal_entries
       WHERE session_id = ? AND embedding IS NOT NULL
       ORDER BY distance ASC
       LIMIT ?`,
      [embeddingStr, sessionId, limit]
    );
    results.push(...journals.map(r => ({
      id: r.id,
      content: r.content,
      source: r.source,
      distance: r.distance,
    })));

    // Search notes
    const [notes] = await connection.execute<RowDataPacket[]>(
      `SELECT id, note_text as content, 'note' as source,
              VEC_COSINE_DISTANCE(embedding, ?) as distance
       FROM notes
       WHERE session_id = ? AND embedding IS NOT NULL AND note_text IS NOT NULL
       ORDER BY distance ASC
       LIMIT ?`,
      [embeddingStr, sessionId, limit]
    );
    results.push(...notes.map(r => ({
      id: r.id,
      content: r.content,
      source: r.source,
      distance: r.distance,
    })));

    // Search decision embeddings (summaries)
    const [decisions] = await connection.execute<RowDataPacket[]>(
      `SELECT id, CONCAT(dimension, ': ', summary) as content, 'decision' as source,
              VEC_COSINE_DISTANCE(embedding, ?) as distance
       FROM decision_embeddings
       WHERE session_id = ? AND embedding IS NOT NULL
       ORDER BY distance ASC
       LIMIT ?`,
      [embeddingStr, sessionId, limit]
    );
    results.push(...decisions.map(r => ({
      id: r.id,
      content: r.content,
      source: r.source,
      distance: r.distance,
    })));

    // Sort all results by distance and return top matches
    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, limit);
  } finally {
    connection.release();
  }
}

// Get recent context without embedding search (for when vectors aren't available)
export async function getRecentUserContext(
  sessionId: string,
  limit: number = 10
): Promise<{ journals: string[]; notes: string[]; decisions: string[] }> {
  const connection = await pool.getConnection();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit))); // Sanitize limit

  try {
    // Recent journal entries
    const [journals] = await connection.execute<RowDataPacket[]>(
      `SELECT title, content FROM journal_entries
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT ${safeLimit}`,
      [sessionId]
    );

    // Recent notes
    const [notes] = await connection.execute<RowDataPacket[]>(
      `SELECT note_text FROM notes
       WHERE session_id = ? AND note_text IS NOT NULL
       ORDER BY created_at DESC
       LIMIT ${safeLimit}`,
      [sessionId]
    );

    // Recent decision summaries
    const [decisions] = await connection.execute<RowDataPacket[]>(
      `SELECT dimension, summary FROM decision_embeddings
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT ${safeLimit}`,
      [sessionId]
    );

    return {
      journals: journals.map(j => `${j.title}: ${j.content}`),
      notes: notes.map(n => n.note_text),
      decisions: decisions.map(d => `${d.dimension}: ${d.summary}`),
    };
  } finally {
    connection.release();
  }
}
