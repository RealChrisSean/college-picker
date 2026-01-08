import { NextRequest, NextResponse } from "next/server";

interface CollegeInput {
  id: number;
  name: string;
  city: string;
  state: string;
  cost: {
    avgNetPrice: number | null;
    netPriceByIncome: Record<string, number | null>;
  };
  debt: {
    medianDebt: number | null;
  };
  earnings: {
    median6yr: number | null;
    median10yr: number | null;
  };
}

interface TreeRequest {
  colleges: CollegeInput[];
  incomeBracket: string;
}

type TimeFrame = "Now" | "Y1" | "Y2" | "Y3" | "Y4" | "Y5" | "Y10";
type Sentiment = "positive" | "neutral" | "negative";

interface CollegeTreeNode {
  id: string;
  title: string;
  description: string;
  timeframe: TimeFrame;
  sentiment: Sentiment;
  financials?: {
    costAtThisPoint: number;
    debtAtThisPoint: number;
    earningsAtThisPoint: number | null;
  };
  children?: CollegeTreeNode[];
}

function getNetPrice(college: CollegeInput, bracket: string): number {
  const byIncome = college.cost.netPriceByIncome?.[bracket];
  return byIncome ?? college.cost.avgNetPrice ?? 20000;
}

function getSentiment(roi: number): Sentiment {
  if (roi > 100000) return "positive";
  if (roi > 0) return "neutral";
  return "negative";
}

function formatMoney(val: number): string {
  return "$" + Math.round(val).toLocaleString();
}

function generateCollegePath(
  college: CollegeInput,
  incomeBracket: string,
  parentId: string
): CollegeTreeNode {
  const netPrice = getNetPrice(college, incomeBracket);
  const debt = college.debt.medianDebt ?? Math.round(netPrice * 4 * 0.6);
  const earnings6yr = college.earnings.median6yr ?? 40000;
  const earnings10yr = college.earnings.median10yr ?? 55000;

  // Calculate costs at each stage
  const year1Cost = netPrice;
  const year4Cost = netPrice * 4;
  const year10Earnings = earnings10yr * 6; // 6 years of work

  // Calculate ROI at year 10
  const roi10yr = year10Earnings - year4Cost - debt;

  const baseId = `${parentId}-${college.id}`;

  // Generate the path for this college
  const graduationNode: CollegeTreeNode = {
    id: `${baseId}-grad`,
    title: "Graduate",
    description: `Debt: ${formatMoney(debt)}, starting salary ~${formatMoney(earnings6yr * 0.7)}`,
    timeframe: "Y4",
    sentiment: "neutral",
    financials: {
      costAtThisPoint: year4Cost,
      debtAtThisPoint: debt,
      earningsAtThisPoint: null,
    },
    children: [
      {
        id: `${baseId}-career`,
        title: "6 Years Into Career",
        description: `Earning ${formatMoney(earnings6yr)}/yr, paying down loans`,
        timeframe: "Y10",
        sentiment: getSentiment(roi10yr),
        financials: {
          costAtThisPoint: year4Cost,
          debtAtThisPoint: Math.max(0, debt * 0.4), // Roughly 60% paid off
          earningsAtThisPoint: earnings10yr,
        },
      },
    ],
  };

  return {
    id: baseId,
    title: college.name,
    description: `${college.city}, ${college.state} - ${formatMoney(netPrice)}/yr`,
    timeframe: "Y1",
    sentiment: "neutral",
    financials: {
      costAtThisPoint: year1Cost,
      debtAtThisPoint: year1Cost * 0.6,
      earningsAtThisPoint: null,
    },
    children: [graduationNode],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: TreeRequest = await request.json();
    const { colleges, incomeBracket } = body;

    if (!colleges || colleges.length === 0) {
      return NextResponse.json({ error: "No colleges provided" }, { status: 400 });
    }

    // Root node: Decision point
    const rootNode: CollegeTreeNode = {
      id: "root",
      title: "Choose Your Path",
      description: "Compare different college outcomes",
      timeframe: "Now",
      sentiment: "neutral",
      children: colleges.map((college) =>
        generateCollegePath(college, incomeBracket, "root")
      ),
    };

    // Also add a "No College" comparison path
    const noCollegePath: CollegeTreeNode = {
      id: "root-no-college",
      title: "Skip College",
      description: "Enter workforce directly",
      timeframe: "Y1",
      sentiment: "neutral",
      financials: {
        costAtThisPoint: 0,
        debtAtThisPoint: 0,
        earningsAtThisPoint: 28000,
      },
      children: [
        {
          id: "root-no-college-y4",
          title: "4 Years Working",
          description: "Earning ~$35,000/yr, no debt",
          timeframe: "Y4",
          sentiment: "neutral",
          financials: {
            costAtThisPoint: 0,
            debtAtThisPoint: 0,
            earningsAtThisPoint: 35000,
          },
          children: [
            {
              id: "root-no-college-y10",
              title: "10 Years Working",
              description: "Earning ~$45,000/yr",
              timeframe: "Y10",
              sentiment: "neutral",
              financials: {
                costAtThisPoint: 0,
                debtAtThisPoint: 0,
                earningsAtThisPoint: 45000,
              },
            },
          ],
        },
      ],
    };

    rootNode.children?.push(noCollegePath);

    return NextResponse.json({
      success: true,
      tree: rootNode,
    });
  } catch (error) {
    console.error("Tree generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate tree", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
