import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

interface AlternativeRequest {
  collegeId: number;
  collegeName: string;
  state: string;
  netPrice: number;
  incomeBracket: string;
}

interface CommunityCollege {
  id: number;
  name: string;
  city: string;
  state: string;
  avgNetPrice: number | null;
  graduationRate: number | null;
}

interface AlternativePath {
  type: "2+2" | "direct";
  description: string;
  communityCollege: CommunityCollege | null;
  targetSchool: string;
  breakdown: {
    years1_2: { school: string; costPerYear: number; total: number };
    years3_4: { school: string; costPerYear: number; total: number };
    totalCost: number;
  };
  savings: number;
  savingsPercent: number;
}

export async function POST(request: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const body: AlternativeRequest = await request.json();
    const { collegeId, collegeName, state, netPrice, incomeBracket } = body;

    if (!collegeId || !state) {
      return NextResponse.json({ error: "College ID and state required" }, { status: 400 });
    }

    // Find community colleges in the same state (ownership = public, low tuition)
    const [ccRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, name, city, state, avg_net_price, graduation_rate_6yr
       FROM colleges
       WHERE state = ?
         AND ownership = 'public'
         AND avg_net_price IS NOT NULL
         AND avg_net_price < 15000
       ORDER BY avg_net_price ASC
       LIMIT 5`,
      [state]
    );

    const communityColleges: CommunityCollege[] = ccRows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      avgNetPrice: r.avg_net_price,
      graduationRate: r.graduation_rate_6yr,
    }));

    // Calculate direct path cost
    const directTotal = netPrice * 4;

    // Find the cheapest CC option
    const cheapestCC = communityColleges[0];
    const alternatives: AlternativePath[] = [];

    // Direct path (for comparison)
    alternatives.push({
      type: "direct",
      description: "Attend 4 years at target school",
      communityCollege: null,
      targetSchool: collegeName,
      breakdown: {
        years1_2: { school: collegeName, costPerYear: netPrice, total: netPrice * 2 },
        years3_4: { school: collegeName, costPerYear: netPrice, total: netPrice * 2 },
        totalCost: directTotal,
      },
      savings: 0,
      savingsPercent: 0,
    });

    // 2+2 path with cheapest community college
    if (cheapestCC && cheapestCC.avgNetPrice) {
      const ccCostPerYear = cheapestCC.avgNetPrice;
      const transferTotal = ccCostPerYear * 2 + netPrice * 2;
      const savings = directTotal - transferTotal;

      alternatives.push({
        type: "2+2",
        description: `2 years at ${cheapestCC.name}, then transfer to ${collegeName}`,
        communityCollege: cheapestCC,
        targetSchool: collegeName,
        breakdown: {
          years1_2: { school: cheapestCC.name, costPerYear: ccCostPerYear, total: ccCostPerYear * 2 },
          years3_4: { school: collegeName, costPerYear: netPrice, total: netPrice * 2 },
          totalCost: transferTotal,
        },
        savings,
        savingsPercent: Math.round((savings / directTotal) * 100),
      });
    }

    // Add more CC options if available
    for (let i = 1; i < Math.min(3, communityColleges.length); i++) {
      const cc = communityColleges[i];
      if (cc && cc.avgNetPrice) {
        const ccCostPerYear = cc.avgNetPrice;
        const transferTotal = ccCostPerYear * 2 + netPrice * 2;
        const savings = directTotal - transferTotal;

        alternatives.push({
          type: "2+2",
          description: `2 years at ${cc.name}, then transfer`,
          communityCollege: cc,
          targetSchool: collegeName,
          breakdown: {
            years1_2: { school: cc.name, costPerYear: ccCostPerYear, total: ccCostPerYear * 2 },
            years3_4: { school: collegeName, costPerYear: netPrice, total: netPrice * 2 },
            totalCost: transferTotal,
          },
          savings,
          savingsPercent: Math.round((savings / directTotal) * 100),
        });
      }
    }

    return NextResponse.json({
      success: true,
      college: { id: collegeId, name: collegeName },
      incomeBracket,
      alternatives,
      availableCommunityColleges: communityColleges,
    });
  } catch (error) {
    console.error("Alternatives error:", error);
    return NextResponse.json(
      { error: "Failed to find alternatives", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
