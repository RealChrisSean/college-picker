import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

// Lightweight autocomplete - checks aliases first, then name search
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "8"), 20);

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const connection = await pool.getConnection();

  try {
    const results: RowDataPacket[] = [];
    const foundIds = new Set<number>();

    // 1. Check for exact alias match first
    const [aliasRows] = await connection.execute<RowDataPacket[]>(
      `SELECT c.id, c.name, c.city, c.state, c.ownership, c.avg_net_price, c.graduation_rate_6yr, c.acceptance_rate,
              c.tuition_in_state, c.tuition_out_of_state, c.room_board_on_campus, c.room_board_off_campus, c.books
       FROM college_aliases a
       JOIN colleges c ON a.college_id = c.id
       WHERE a.alias = ?
       LIMIT 1`,
      [q.toLowerCase()]
    );

    for (const row of aliasRows) {
      if (!foundIds.has(row.id)) {
        results.push(row);
        foundIds.add(row.id);
      }
    }

    // 2. Search by name (LIKE pattern)
    const likePattern = `%${q.toLowerCase()}%`;
    const [nameRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, name, city, state, ownership, avg_net_price, graduation_rate_6yr, acceptance_rate,
              tuition_in_state, tuition_out_of_state, room_board_on_campus, room_board_off_campus, books
       FROM colleges
       WHERE LOWER(name) LIKE ?
       ORDER BY
         CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END,
         LENGTH(name) ASC
       LIMIT ${limit}`,
      [likePattern, `${q.toLowerCase()}%`]
    );

    for (const row of nameRows) {
      if (!foundIds.has(row.id) && results.length < limit) {
        results.push(row);
        foundIds.add(row.id);
      }
    }

    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
        ownership: r.ownership,
        avgNetPrice: r.avg_net_price,
        graduationRate6yr: r.graduation_rate_6yr,
        acceptanceRate: r.acceptance_rate,
        tuitionInState: r.tuition_in_state,
        tuitionOutOfState: r.tuition_out_of_state,
        roomBoardOnCampus: r.room_board_on_campus,
        roomBoardOffCampus: r.room_board_off_campus,
        books: r.books,
      })),
    });
  } catch (error) {
    console.error("Autocomplete error:", error);
    return NextResponse.json({ results: [] });
  } finally {
    connection.release();
  }
}
