import { NextRequest, NextResponse } from "next/server";

const COLLEGE_SCORECARD_API = "https://api.data.gov/ed/collegescorecard/v1/schools";
const API_KEY = process.env.COLLEGE_SCORE_CARD;

const FIELDS = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.school_url",
  "school.ownership",
  "school.locale",
  "school.carnegie_size_setting",
  "latest.admissions.admission_rate.overall",
  "latest.admissions.sat_scores.average.overall",
  "latest.admissions.act_scores.midpoint.cumulative",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.cost.booksupply",
  "latest.cost.roomboard.oncampus",
  "latest.cost.roomboard.offcampus",
  "latest.cost.attendance.academic_year",
  "latest.cost.avg_net_price.overall",
  "latest.cost.net_price.public.by_income_level.0-30000",
  "latest.cost.net_price.public.by_income_level.30001-48000",
  "latest.cost.net_price.public.by_income_level.48001-75000",
  "latest.cost.net_price.public.by_income_level.75001-110000",
  "latest.cost.net_price.public.by_income_level.110001-plus",
  "latest.cost.net_price.private.by_income_level.0-30000",
  "latest.cost.net_price.private.by_income_level.30001-48000",
  "latest.cost.net_price.private.by_income_level.48001-75000",
  "latest.cost.net_price.private.by_income_level.75001-110000",
  "latest.cost.net_price.private.by_income_level.110001-plus",
  "latest.student.size",
  "latest.student.grad_students",
  "latest.completion.consumer_rate",
  "latest.completion.title_iv.completed_by.4yrs",
  "latest.completion.title_iv.completed_by.6yrs",
  "latest.student.retention_rate.overall.full_time",
  "latest.aid.median_debt.completers.overall",
  "latest.aid.median_debt.completers.monthly_payments",
  "latest.aid.pell_grant_rate",
  "latest.aid.federal_loan_rate",
  "latest.earnings.6_yrs_after_entry.median",
  "latest.earnings.10_yrs_after_entry.median",
  "latest.earnings.10_yrs_after_entry.working_not_enrolled.mean_earnings",
].join(",");

export interface CollegeData {
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
}

function parseOwnership(value: number | null): CollegeData["ownership"] {
  switch (value) {
    case 1: return "public";
    case 2: return "private_nonprofit";
    case 3: return "private_forprofit";
    default: return "private_nonprofit";
  }
}

function transformCollegeData(raw: Record<string, unknown>): CollegeData {
  const latest = raw.latest as Record<string, unknown> || {};
  const schoolData = (latest.school || {}) as Record<string, unknown>;
  const cost = latest.cost as Record<string, unknown> || {};
  const admissions = latest.admissions as Record<string, unknown> || {};
  const student = latest.student as Record<string, unknown> || {};
  const completion = latest.completion as Record<string, unknown> || {};
  const aid = latest.aid as Record<string, unknown> || {};
  const earnings = latest.earnings as Record<string, unknown> || {};

  const satScores = (admissions.sat_scores as Record<string, unknown>)?.average as Record<string, unknown> || {};
  const actScores = (admissions.act_scores as Record<string, unknown>)?.midpoint as Record<string, unknown> || {};
  const admissionRate = admissions.admission_rate as Record<string, unknown> || {};
  const tuition = cost.tuition as Record<string, unknown> || {};
  const roomboard = cost.roomboard as Record<string, unknown> || {};
  const attendance = cost.attendance as Record<string, unknown> || {};
  const avgNetPrice = cost.avg_net_price as Record<string, unknown> || {};
  const netPrice = cost.net_price as Record<string, unknown> || {};
  const publicNetPrice = (netPrice.public as Record<string, unknown>)?.by_income_level as Record<string, unknown> || {};
  const privateNetPrice = (netPrice.private as Record<string, unknown>)?.by_income_level as Record<string, unknown> || {};
  const titleIv = completion.title_iv as Record<string, unknown> || {};
  const completedBy = titleIv.completed_by as Record<string, unknown> || {};
  const retentionRate = (student.retention_rate as Record<string, unknown>)?.overall as Record<string, unknown> || {};
  const medianDebt = (aid.median_debt as Record<string, unknown>)?.completers as Record<string, unknown> || {};
  const earnings6yr = earnings["6_yrs_after_entry"] as Record<string, unknown> || {};
  const earnings10yr = earnings["10_yrs_after_entry"] as Record<string, unknown> || {};
  const workingNotEnrolled = earnings10yr.working_not_enrolled as Record<string, unknown> || {};

  const ownership = parseOwnership(schoolData.ownership as number);
  const netPriceByIncome = ownership === "public" ? publicNetPrice : privateNetPrice;

  return {
    id: raw.id as number,
    name: schoolData.name as string || "",
    city: schoolData.city as string || "",
    state: schoolData.state as string || "",
    website: schoolData.school_url as string || null,
    ownership,
    size: student.size as number || null,

    admissions: {
      acceptanceRate: admissionRate.overall as number || null,
      satAverage: satScores.overall as number || null,
      actAverage: actScores.cumulative as number || null,
    },

    cost: {
      tuitionInState: tuition.in_state as number || null,
      tuitionOutOfState: tuition.out_of_state as number || null,
      books: cost.booksupply as number || null,
      roomBoardOnCampus: roomboard.oncampus as number || null,
      roomBoardOffCampus: roomboard.offcampus as number || null,
      totalAttendance: attendance.academic_year as number || null,
      avgNetPrice: avgNetPrice.overall as number || null,
      netPriceByIncome: {
        "0-30000": netPriceByIncome["0-30000"] as number || null,
        "30001-48000": netPriceByIncome["30001-48000"] as number || null,
        "48001-75000": netPriceByIncome["48001-75000"] as number || null,
        "75001-110000": netPriceByIncome["75001-110000"] as number || null,
        "110001-plus": netPriceByIncome["110001-plus"] as number || null,
      },
    },

    outcomes: {
      graduationRate4yr: completedBy["4yrs"] as number || null,
      graduationRate6yr: completedBy["6yrs"] as number || null,
      retentionRate: retentionRate.full_time as number || null,
    },

    debt: {
      medianDebt: medianDebt.overall as number || null,
      monthlyPayment: medianDebt.monthly_payments as number || null,
    },

    earnings: {
      median6yr: earnings6yr.median as number || null,
      median10yr: earnings10yr.median as number || null,
      mean10yr: workingNotEnrolled.mean_earnings as number || null,
    },

    aid: {
      pellGrantRate: aid.pell_grant_rate as number || null,
      federalLoanRate: aid.federal_loan_rate as number || null,
    },
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const name = searchParams.get("name");
  const state = searchParams.get("state");
  const id = searchParams.get("id");
  const limit = searchParams.get("limit") || "10";

  if (!API_KEY) {
    return NextResponse.json(
      { error: "College Scorecard API key not configured" },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    api_key: API_KEY,
    fields: FIELDS,
    per_page: limit,
  });

  if (id) {
    params.append("id", id);
  } else if (name) {
    params.append("school.name", name);
  }

  if (state) {
    params.append("school.state", state);
  }

  params.append("school.degrees_awarded.predominant", "3");

  try {
    const response = await fetch(`${COLLEGE_SCORECARD_API}?${params.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("College Scorecard API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch college data", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const colleges: CollegeData[] = (data.results || []).map(transformCollegeData);

    return NextResponse.json({
      total: data.metadata?.total || 0,
      page: data.metadata?.page || 0,
      colleges,
    });

  } catch (error) {
    console.error("Error fetching college data:", error);
    return NextResponse.json(
      { error: "Failed to fetch college data" },
      { status: 500 }
    );
  }
}