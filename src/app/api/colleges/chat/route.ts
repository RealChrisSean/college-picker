import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import db from "@/lib/db";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Extract potential college search terms from user message
function extractSearchTerms(text: string): string[] {
  const terms = new Set<string>();

  // 1. All-caps abbreviations (2-6 letters) - UCLA, MIT, UNLV, CSN, etc.
  const abbrevMatches = text.match(/\b[A-Z]{2,6}\b/g) || [];
  for (const abbrev of abbrevMatches) {
    // Skip common non-college abbreviations
    if (!["THE", "AND", "FOR", "BUT", "NOT", "YOU", "ARE", "CAN", "HAS", "HAD", "WAS", "HER", "HIS", "HIM", "SHE", "HER", "THEY", "WHAT", "WHEN", "WHERE", "WHY", "HOW", "WHO"].includes(abbrev)) {
      terms.add(abbrev.toLowerCase());
    }
  }

  // 2. Capitalized phrases (1-5 words) - "University of Nevada", "College of Southern Nevada", etc.
  const phrasePattern = /\b([A-Z][a-z]+(?:\s+(?:of|the|and|at|in|for)?\s*[A-Z][a-z]+){0,4})\b/g;
  const phraseMatches = text.matchAll(phrasePattern);
  for (const match of phraseMatches) {
    const phrase = match[1].trim();
    // Skip short single words that are probably not colleges
    if (phrase.length > 3 && !["What", "When", "Where", "Why", "How", "Which", "Would", "Could", "Should", "Have", "That", "This", "Then", "Than", "From", "About", "Between"].includes(phrase)) {
      terms.add(phrase.toLowerCase());
    }
  }

  // 3. Words ending in University, College, State, Tech, Institute
  const explicitPattern = /([A-Za-z\s]+(?:University|College|State|Tech|Institute|School))/gi;
  const explicitMatches = text.matchAll(explicitPattern);
  for (const match of explicitMatches) {
    terms.add(match[1].trim().toLowerCase());
  }

  // 4. Community college mention
  if (/community college/i.test(text)) {
    terms.add("community college");
  }

  return Array.from(terms);
}

// Log a failed lookup for later review
async function logLookupMiss(query: string, userMessage: string) {
  try {
    await db.execute(
      `INSERT INTO college_lookup_misses (query, user_message, hit_count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE hit_count = hit_count + 1, user_message = VALUES(user_message)`,
      [query.toLowerCase().substring(0, 255), userMessage.substring(0, 1000)]
    );
  } catch (err) {
    // Silent fail - logging shouldn't break the main flow
    console.error("Failed to log lookup miss:", err);
  }
}

// Look up colleges in our database (checking aliases first)
async function lookupColleges(names: string[], userMessage: string): Promise<Record<string, unknown>[]> {
  const colleges: Record<string, unknown>[] = [];
  const foundIds = new Set<number>(); // Prevent duplicates

  for (const name of names) {
    if (name.toLowerCase() === "community college") {
      // Return generic community college data
      colleges.push({
        name: "Community College (2-year)",
        isGeneric: true,
        cost: { avgNetPrice: 4000, tuitionInState: 3500 },
        debt: { medianDebt: 8000 },
        earnings: { median6yr: 35000, median10yr: 42000 },
        outcomes: { graduationRate6yr: 0.28 }, // transfer rate is different
        type: "community_college",
      });
      continue;
    }

    try {
      // First, check if this is an alias
      const [aliasRows] = await db.execute(
        `SELECT c.id, c.name, c.city, c.state,
                c.avg_net_price, c.tuition_in_state, c.tuition_out_of_state,
                c.median_debt, c.monthly_payment,
                c.median_earnings_6yr, c.median_earnings_10yr,
                c.graduation_rate_4yr, c.graduation_rate_6yr, c.retention_rate,
                c.acceptance_rate, c.sat_average, c.act_average,
                c.size, c.ownership
         FROM college_aliases a
         JOIN colleges c ON a.college_id = c.id
         WHERE a.alias = ?
         LIMIT 1`,
        [name.toLowerCase()]
      );

      let resultRows = aliasRows as Record<string, unknown>[];

      // If no alias match, fall back to LIKE search
      if (resultRows.length === 0) {
        const [likeRows] = await db.execute(
          `SELECT id, name, city, state,
                  avg_net_price, tuition_in_state, tuition_out_of_state,
                  median_debt, monthly_payment,
                  median_earnings_6yr, median_earnings_10yr,
                  graduation_rate_4yr, graduation_rate_6yr, retention_rate,
                  acceptance_rate, sat_average, act_average,
                  size, ownership
           FROM colleges
           WHERE LOWER(name) LIKE LOWER(?)
           ORDER BY size DESC
           LIMIT 1`,
          [`%${name}%`]
        );
        resultRows = likeRows as Record<string, unknown>[];
      }

      if (resultRows.length > 0) {
        const row = resultRows[0];
        const collegeId = row.id as number;

        // Skip if we already have this college
        if (foundIds.has(collegeId)) continue;
        foundIds.add(collegeId);

        colleges.push({
          id: row.id,
          name: row.name,
          city: row.city,
          state: row.state,
          cost: {
            avgNetPrice: row.avg_net_price,
            tuitionInState: row.tuition_in_state,
            tuitionOutOfState: row.tuition_out_of_state,
          },
          debt: {
            medianDebt: row.median_debt,
            monthlyPayment: row.monthly_payment,
          },
          earnings: {
            median6yr: row.median_earnings_6yr,
            median10yr: row.median_earnings_10yr,
          },
          outcomes: {
            graduationRate4yr: row.graduation_rate_4yr,
            graduationRate6yr: row.graduation_rate_6yr,
            retentionRate: row.retention_rate,
          },
          admissions: {
            acceptanceRate: row.acceptance_rate,
            satAverage: row.sat_average,
            actAverage: row.act_average,
          },
          size: row.size,
          ownership: row.ownership,
        });
      } else {
        // Log the miss for later review
        await logLookupMiss(name, userMessage);
      }
    } catch (err) {
      console.error(`Error looking up college ${name}:`, err);
    }
  }

  return colleges;
}

const systemPrompt = `You are a brutally honest college advisor. Your job is to help students see the REAL consequences of their college decisions - both good and bad.

You have access to real data about colleges. When a student mentions a school, you'll receive actual cost, debt, and earnings data.

YOUR MISSION: Show them both paths:
1. THE GOOD OUTCOME - If everything works out (they graduate, get a job in their field)
2. THE REALISTIC RISK - What happens if they don't land that job (which is common)

BE SPECIFIC WITH NUMBERS:
- "You'll graduate with $45,000 in debt. Monthly payment: $450 for 10 years."
- "If you get the nursing job, you'll make $65k and pay it off in 7 years. If you end up in retail at $15/hr, you're paying $450/month on a $31k salary - that's 17% of your take-home. You'll struggle."

CALL OUT HARD TRUTHS:
- "40% of students who start pre-med don't finish. What's your backup?"
- "Only 27% of psychology majors work in psychology-related jobs."
- "A business degree from this school has the same median salary as no degree - $38k."

BE HELPFUL, NOT DISCOURAGING:
- Suggest alternatives: "Have you considered community college first? Same degree, half the debt."
- Show the math: "2 years at CC ($8k) + 2 years at State ($40k) = $48k total vs $120k for 4 years private."
- End with 1-2 relevant questions, not a list of questions upfront.

KNOW WHEN TO STOP:
- If they defend the same choice twice, they've heard you. Stop warning, start helping.
- If they say "I know but..." or provide context that changes things (e.g., "my parents are paying cash"), acknowledge it and adjust.
- Once they've decided, switch to helping them succeed: "Okay, here's how to make this work..."

TONE: Like a smart older sibling who's been through it. Direct, caring, no BS.

FORMAT: Use bold section headers (THE MATH BREAKDOWN, THE BRUTAL REALITY CHECK, MY RECOMMENDATION). Short paragraphs. Bold key numbers. Conversational, not formal.`;

export async function POST(request: NextRequest) {
  try {
    const { message, history } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Extract potential search terms and look up colleges
    const searchTerms = extractSearchTerms(message);
    const collegeData = await lookupColleges(searchTerms, message);

    // Build context with college data
    let collegeContext = "";
    if (collegeData.length > 0) {
      collegeContext = "\n\n[COLLEGE DATA - Use these real numbers in your response]\n";
      for (const college of collegeData) {
        const c = college as {
          name: string;
          city?: string;
          state?: string;
          isGeneric?: boolean;
          cost: { avgNetPrice: number | null; tuitionInState?: number | null };
          debt: { medianDebt: number | null; monthlyPayment?: number | null };
          earnings: { median6yr: number | null; median10yr: number | null };
          outcomes: { graduationRate6yr: number | null };
        };
        collegeContext += `\n${c.name}${c.city ? ` (${c.city}, ${c.state})` : ""}:
- Average net price: $${c.cost.avgNetPrice?.toLocaleString() || "N/A"}/year
- 4-year total cost: ~$${c.cost.avgNetPrice ? (c.cost.avgNetPrice * 4).toLocaleString() : "N/A"}
- Median debt at graduation: $${c.debt.medianDebt?.toLocaleString() || "N/A"}
- Monthly loan payment (10yr): $${c.debt.monthlyPayment?.toLocaleString() || Math.round((c.debt.medianDebt || 0) / 120).toLocaleString()}
- Median salary 6 years after: $${c.earnings.median6yr?.toLocaleString() || "N/A"}
- Median salary 10 years after: $${c.earnings.median10yr?.toLocaleString() || "N/A"}
- Graduation rate: ${c.outcomes.graduationRate6yr ? (c.outcomes.graduationRate6yr * 100).toFixed(0) + "%" : "N/A"}
`;
      }
    }

    // Build conversation history
    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    // Add the new message with college context
    messages.push({
      role: "user",
      content: message + collegeContext,
    });

    // Call Claude
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    });

    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({
      message: assistantMessage,
      collegesFound: collegeData.map((c) => (c as { name: string }).name),
      collegeData: collegeData, // Return full data for inline visualizations
    });
  } catch (error) {
    console.error("College chat error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
