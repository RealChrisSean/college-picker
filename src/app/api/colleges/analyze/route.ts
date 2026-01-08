import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { logApiMetric } from "@/lib/metrics";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Repair malformed JSON from LLM responses
function repairJSON(jsonText: string): string {
  let text = jsonText;
  text = text.replace(/'([^']+)'(\s*:)/g, '"$1"$2');
  text = text.replace(/:\s*'([^']*)'/g, ': "$1"');
  text = text.replace(/\[\s*'([^']*)'/g, '["$1"');
  text = text.replace(/,\s*'([^']*)'/g, ', "$1"');
  text = text.replace(/\/\/[^\n]*/g, '');
  text = text.replace(/,(\s*[}\]])/g, '$1');
  text = text.replace(/{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '{"$1":');
  text = text.replace(/,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, ', "$1":');

  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\' && inString) { escapeNext = true; continue; }
    if (char === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      else if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
    }
  }

  if (inString) text = text + '"';
  while (bracketCount > 0) { text = text + ']'; bracketCount--; }
  while (braceCount > 0) { text = text + '}'; braceCount--; }
  text = text.replace(/,\s*}/g, '}');
  text = text.replace(/,\s*]/g, ']');

  return text;
}

function parseJSONWithRepair(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch {
    const repaired = repairJSON(jsonText);
    return JSON.parse(repaired);
  }
}

interface CollegeInput {
  id: number;
  name: string;
  city: string;
  state: string;
  ownership: string;
  size: number | null;
  admissions: {
    acceptanceRate: number | null;
    satAverage: number | null;
  };
  cost: {
    tuitionInState: number | null;
    tuitionOutOfState: number | null;
    avgNetPrice: number | null;
    netPriceByIncome: Record<string, number | null>;
  };
  outcomes: {
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
  };
}

interface AnalysisRequest {
  colleges: CollegeInput[];
  incomeBracket: string;
  userContext?: string;
}

const INCOME_LABELS: Record<string, string> = {
  "0-30000": "under $30k",
  "30001-48000": "$30k-$48k",
  "48001-75000": "$48k-$75k",
  "75001-110000": "$75k-$110k",
  "110001-plus": "over $110k",
};

function formatMoney(val: number | null): string {
  if (val === null) return "N/A";
  return "$" + val.toLocaleString();
}

function getNetPrice(college: CollegeInput, bracket: string): number | null {
  return college.cost.netPriceByIncome?.[bracket] ?? college.cost.avgNetPrice;
}

function buildCollegeContext(colleges: CollegeInput[], incomeBracket: string): string {
  return colleges.map((c, i) => {
    const netPrice = getNetPrice(c, incomeBracket);
    const totalCost = netPrice ? netPrice * 4 : null;
    const debt = c.debt.medianDebt;
    const earnings = c.earnings.median10yr;
    const gradRate = c.outcomes.graduationRate6yr;
    const roi = debt && earnings ? Math.round((earnings * 10 - (totalCost || 0)) / 1000) : null;

    return `
COLLEGE ${i + 1}: ${c.name}
- Location: ${c.city}, ${c.state}
- Type: ${c.ownership.replace("_", " ")}
- Size: ${c.size?.toLocaleString() || "N/A"} students
- Acceptance rate: ${c.admissions.acceptanceRate ? (c.admissions.acceptanceRate * 100).toFixed(0) + "%" : "N/A"}
- SAT average: ${c.admissions.satAverage || "N/A"}
- Net price for family income ${INCOME_LABELS[incomeBracket]}: ${formatMoney(netPrice)}/year
- 4-year total cost: ${formatMoney(totalCost)}
- Median debt at graduation: ${formatMoney(debt)}
- Monthly loan payment: ${formatMoney(c.debt.monthlyPayment)}
- 6-year graduation rate: ${gradRate ? (gradRate * 100).toFixed(0) + "%" : "N/A"}
- Median earnings 6 years after: ${formatMoney(c.earnings.median6yr)}
- Median earnings 10 years after: ${formatMoney(earnings)}
- Estimated 10-year ROI: ${roi ? formatMoney(roi * 1000) : "N/A"}
`.trim();
  }).join("\n\n");
}

const ANALYSIS_PROMPT = `You are a brutally honest college advisor. Your job is to help students make smart financial decisions about education.

You will analyze colleges and provide:
1. A verdict for each (Excellent/Good/Fair/Poor ROI)
2. Why to choose it (3 specific reasons)
3. Why NOT to choose it (3 honest concerns)
4. Who it's best for
5. Any red flags

Be direct. Don't sugarcoat. Students need to know the real financial implications.

For expensive schools with low ROI, suggest community college alternatives.
For schools with high debt-to-earnings ratios, warn them clearly.

Output ONLY valid JSON with this structure:
{
  "summary": "One-sentence overview comparing all options",
  "colleges": [
    {
      "id": <college id>,
      "name": "<college name>",
      "verdict": "Excellent" | "Good" | "Fair" | "Poor",
      "whyChoose": ["reason 1", "reason 2", "reason 3"],
      "whyNot": ["concern 1", "concern 2", "concern 3"],
      "bestFor": "Description of ideal student for this school",
      "warning": "Red flag if any, or null"
    }
  ],
  "recommendation": "Based on the data, here's what I'd suggest...",
  "alternativePath": "If any school is expensive, suggest CC-to-transfer option here, or null"
}

CRITICAL: Output ONLY the JSON object. No markdown, no code blocks, no explanation.`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const connection = await pool.getConnection();

  try {
    const body: AnalysisRequest = await request.json();
    const { colleges, incomeBracket, userContext } = body;

    if (!colleges || colleges.length === 0) {
      return NextResponse.json({ error: "No colleges provided" }, { status: 400 });
    }

    if (colleges.length > 4) {
      return NextResponse.json({ error: "Maximum 4 colleges allowed" }, { status: 400 });
    }

    // Fetch full college data from database
    const collegeIds = colleges.map(c => c.id);
    const placeholders = collegeIds.map(() => '?').join(',');

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, name, city, state, ownership, size,
              acceptance_rate, sat_average,
              tuition_in_state, tuition_out_of_state, avg_net_price,
              net_price_public_0_30000, net_price_public_30001_48000, net_price_public_48001_75000, net_price_public_75001_110000, net_price_public_110001_plus,
              net_price_private_0_30000, net_price_private_30001_48000, net_price_private_48001_75000, net_price_private_75001_110000, net_price_private_110001_plus,
              graduation_rate_6yr, retention_rate,
              median_debt, monthly_payment,
              earnings_6yr, earnings_10yr
       FROM colleges
       WHERE id IN (${placeholders})`,
      collegeIds
    );

    // Map DB rows to CollegeInput format
    const fullColleges: CollegeInput[] = rows.map(row => {
      const isPublic = row.ownership === "public";
      return {
        id: row.id,
        name: row.name,
        city: row.city,
        state: row.state,
        ownership: row.ownership || "unknown",
        size: row.size,
        admissions: {
          acceptanceRate: row.acceptance_rate,
          satAverage: row.sat_average,
        },
        cost: {
          tuitionInState: row.tuition_in_state,
          tuitionOutOfState: row.tuition_out_of_state,
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
        },
      };
    });

    const collegeContext = buildCollegeContext(fullColleges, incomeBracket);

    const userMessage = `
Analyze these colleges for a student with family income ${INCOME_LABELS[incomeBracket]}:

${collegeContext}

${userContext ? `Additional context: ${userContext}` : ""}

Provide your analysis.
`.trim();

    const response = await openai.responses.create({
      model: "gpt-5.1",
      instructions: ANALYSIS_PROMPT,
      input: userMessage,
    });

    const latency = Date.now() - startTime;

    logApiMetric({
      endpoint: "/api/colleges/analyze",
      model: "gpt-5.1",
      latencyMs: latency,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      success: true,
    });

    const textContent = response.output_text;
    if (!textContent) {
      return NextResponse.json({ error: "No text response from AI" }, { status: 500 });
    }

    let jsonText = textContent.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const analysis = parseJSONWithRepair(jsonText);

    return NextResponse.json({
      success: true,
      analysis,
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error("College analysis error:", error);

    logApiMetric({
      endpoint: "/api/colleges/analyze",
      model: "gpt-5.1",
      latencyMs: latency,
      success: false,
      errorType: error instanceof Error ? error.name : "unknown",
    });

    return NextResponse.json(
      { error: "Failed to analyze colleges", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
