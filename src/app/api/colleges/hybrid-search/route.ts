import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import { generateEmbedding, formatEmbeddingForDB } from "@/lib/embeddings";

export interface CollegeResult {
  id: number;
  name: string;
  city: string;
  state: string;
  website: string | null;
  ownership: "public" | "private_nonprofit" | "private_forprofit";
  size: number | null;

  admissions: {
    acceptanceRate: number | null;
    satAverage: number | null;
    actAverage: number | null;
  };

  cost: {
    tuitionInState: number | null;
    tuitionOutOfState: number | null;
    books: number | null;
    roomBoardOnCampus: number | null;
    roomBoardOffCampus: number | null;
    totalAttendance: number | null;
    avgNetPrice: number | null;
    netPriceByIncome: {
      "0-30000": number | null;
      "30001-48000": number | null;
      "48001-75000": number | null;
      "75001-110000": number | null;
      "110001-plus": number | null;
    };
  };

  outcomes: {
    graduationRate4yr: number | null;
    graduationRate6yr: number | null;
    retentionRate: number | null;
  };

  debt: {
    medianDebt: number | null;
    monthlyPayment: number | null;
  };

  earnings: {
    median6yr: number | null;
    median10yr: number | null;
    mean10yr: number | null;
  };

  aid: {
    pellGrantRate: number | null;
    federalLoanRate: number | null;
  };

  // Search relevance score
  score?: number;
}

function transformRow(row: RowDataPacket): CollegeResult {
  const isPublic = row.ownership === "public";

  return {
    id: row.id,
    name: row.name,
    city: row.city,
    state: row.state,
    website: row.website,
    ownership: row.ownership,
    size: row.size,

    admissions: {
      acceptanceRate: row.acceptance_rate,
      satAverage: row.sat_average,
      actAverage: row.act_average,
    },

    cost: {
      tuitionInState: row.tuition_in_state,
      tuitionOutOfState: row.tuition_out_of_state,
      books: row.books,
      roomBoardOnCampus: row.room_board_on_campus,
      roomBoardOffCampus: row.room_board_off_campus,
      totalAttendance: row.total_attendance,
      avgNetPrice: row.avg_net_price,
      netPriceByIncome: isPublic
        ? {
            "0-30000": row.net_price_public_0_30000,
            "30001-48000": row.net_price_public_30001_48000,
            "48001-75000": row.net_price_public_48001_75000,
            "75001-110000": row.net_price_public_75001_110000,
            "110001-plus": row.net_price_public_110001_plus,
          }
        : {
            "0-30000": row.net_price_private_0_30000,
            "30001-48000": row.net_price_private_30001_48000,
            "48001-75000": row.net_price_private_48001_75000,
            "75001-110000": row.net_price_private_75001_110000,
            "110001-plus": row.net_price_private_110001_plus,
          },
    },

    outcomes: {
      graduationRate4yr: row.graduation_rate_4yr,
      graduationRate6yr: row.graduation_rate_6yr,
      retentionRate: row.retention_rate,
    },

    debt: {
      medianDebt: row.median_debt,
      monthlyPayment: row.monthly_payment,
    },

    earnings: {
      median6yr: row.earnings_6yr,
      median10yr: row.earnings_10yr,
      mean10yr: row.earnings_10yr_mean,
    },

    aid: {
      pellGrantRate: row.pell_grant_rate,
      federalLoanRate: row.federal_loan_rate,
    },
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const query = searchParams.get("q") || "";
  const state = searchParams.get("state");
  const id = searchParams.get("id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
  const mode = searchParams.get("mode") || "hybrid"; // "text", "vector", or "hybrid"

  const connection = await pool.getConnection();

  try {
    // Direct ID lookup
    if (id) {
      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM colleges WHERE id = ?",
        [id]
      );

      if (rows.length === 0) {
        return NextResponse.json({ colleges: [], total: 0 });
      }

      return NextResponse.json({
        colleges: rows.map(transformRow),
        total: 1,
      });
    }

    // Empty query - return popular/large schools
    if (!query) {
      let sql = "SELECT * FROM colleges WHERE size IS NOT NULL";
      const params: (string | number)[] = [];

      if (state) {
        sql += " AND state = ?";
        params.push(state);
      }

      sql += ` ORDER BY size DESC LIMIT ${limit}`;


      const [rows] = await connection.execute<RowDataPacket[]>(sql, params);

      return NextResponse.json({
        colleges: rows.map(transformRow),
        total: rows.length,
      });
    }

    // Text search using TiDB full-text search (BM25 ranking)
    if (mode === "text" || mode === "hybrid") {
      // Sanitize and escape the search query for full-text search
      // Remove special chars and escape single quotes to prevent SQL injection
      const searchQuery = query.replace(/[^\w\s]/g, "").trim().replace(/'/g, "''");

      let sql = `
        SELECT *,
          FTS_MATCH_WORD('${searchQuery}', name) as text_score
        FROM colleges
        WHERE FTS_MATCH_WORD('${searchQuery}', name)
      `;
      const params: (string | number)[] = [];

      if (state) {
        sql += " AND state = ?";
        params.push(state);
      }

      sql += ` ORDER BY text_score DESC, name ASC LIMIT ${limit}`;


      const [textResults] = await connection.execute<RowDataPacket[]>(sql, params);

      // If text-only mode or we got enough results, return them
      if (mode === "text" || textResults.length >= limit) {
        return NextResponse.json({
          colleges: textResults.map((r) => ({
            ...transformRow(r),
            score: r.text_score,
          })),
          total: textResults.length,
          mode: "text",
        });
      }

      // For hybrid mode, also do vector search if text didn't find enough
      if (mode === "hybrid" && textResults.length < limit) {
        try {
          const embedding = await generateEmbedding(query);
          const embeddingStr = formatEmbeddingForDB(embedding);

          let vectorSql = `
            SELECT *,
              VEC_COSINE_DISTANCE(embedding, ?) as distance
            FROM colleges
            WHERE embedding IS NOT NULL
          `;
          const vectorParams: (string | number)[] = [embeddingStr];

          if (state) {
            vectorSql += " AND state = ?";
            vectorParams.push(state);
          }

          vectorSql += ` ORDER BY distance ASC LIMIT ${limit}`;


          const [vectorResults] = await connection.execute<RowDataPacket[]>(
            vectorSql,
            vectorParams
          );

          // Merge and deduplicate results
          const seenIds = new Set(textResults.map((r) => r.id));
          const combinedResults = [...textResults];

          for (const vr of vectorResults) {
            if (!seenIds.has(vr.id)) {
              seenIds.add(vr.id);
              combinedResults.push(vr);
            }
          }

          // Sort by combined score (text matches first, then by vector similarity)
          const results = combinedResults.slice(0, limit).map((r) => ({
            ...transformRow(r),
            score: r.text_score || (1 - (r.distance || 0)),
          }));

          return NextResponse.json({
            colleges: results,
            total: results.length,
            mode: "hybrid",
          });
        } catch {
          // If vector search fails, just return text results
          return NextResponse.json({
            colleges: textResults.map((r) => ({
              ...transformRow(r),
              score: r.text_score,
            })),
            total: textResults.length,
            mode: "text",
          });
        }
      }
    }

    // Vector-only search
    if (mode === "vector") {
      const embedding = await generateEmbedding(query);
      const embeddingStr = formatEmbeddingForDB(embedding);

      let sql = `
        SELECT *,
          VEC_COSINE_DISTANCE(embedding, ?) as distance
        FROM colleges
        WHERE embedding IS NOT NULL
      `;
      const params: (string | number)[] = [embeddingStr];

      if (state) {
        sql += " AND state = ?";
        params.push(state);
      }

      sql += ` ORDER BY distance ASC LIMIT ${limit}`;


      const [rows] = await connection.execute<RowDataPacket[]>(sql, params);

      return NextResponse.json({
        colleges: rows.map((r) => ({
          ...transformRow(r),
          score: 1 - r.distance, // Convert distance to similarity
        })),
        total: rows.length,
        mode: "vector",
      });
    }

    return NextResponse.json({ colleges: [], total: 0 });
  } catch (error) {
    console.error("Error searching colleges:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to search colleges", details: errorMessage },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
