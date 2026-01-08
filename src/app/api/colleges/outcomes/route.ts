import { NextRequest, NextResponse } from "next/server";

interface CollegeInput {
  id: number;
  name: string;
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
  outcomes: {
    graduationRate6yr: number | null;
  };
}

type ProfessionalPath = "bachelors" | "medical" | "law" | "phd" | "mba";

interface OutcomeRequest {
  college: CollegeInput;
  incomeBracket: string;
  professionalPath?: ProfessionalPath;
}

interface TimelineYear {
  year: number;
  label: string;
  phase: "undergrad" | "grad_school" | "residency" | "career";
  tuitionPaidThisYear: number;
  cumulativeTuition: number;
  debtWithInterest: number;
  earnings: number | null;
  loanPayment: number | null;
  netIncome: number | null;
  netWorth: number;
  milestone: string;
}

interface OutcomeSummary {
  totalCost: number;
  totalDebt: number;
  breakEvenYear: number | null;
  roiAtEnd: number;
  monthlyPayment: number;
  yearsToPayoff: number;
  path: string;
  totalYears: number;
}

// Professional path configurations
const PROFESSIONAL_PATHS = {
  bachelors: {
    name: "Bachelor's Degree",
    undergradYears: 4,
    gradYears: 0,
    residencyYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    peakSalary: 65000, // Median bachelor's salary
    salaryGrowthRate: 0.03,
  },
  medical: {
    name: "Medical Doctor (MD)",
    undergradYears: 4,
    gradYears: 4,
    residencyYears: 4, // Residency pays ~60k
    gradCostPerYear: 60000,
    additionalDebt: 200000,
    peakSalary: 250000,
    salaryGrowthRate: 0.02,
  },
  law: {
    name: "Law (JD)",
    undergradYears: 4,
    gradYears: 3,
    residencyYears: 0,
    gradCostPerYear: 55000,
    additionalDebt: 145000,
    peakSalary: 130000,
    salaryGrowthRate: 0.03,
  },
  phd: {
    name: "PhD",
    undergradYears: 4,
    gradYears: 5, // Often funded, low cost
    residencyYears: 0,
    gradCostPerYear: 5000, // Usually funded with stipend
    additionalDebt: 25000,
    peakSalary: 95000,
    salaryGrowthRate: 0.025,
  },
  mba: {
    name: "MBA",
    undergradYears: 4,
    gradYears: 2,
    residencyYears: 0,
    gradCostPerYear: 70000,
    additionalDebt: 120000,
    peakSalary: 150000,
    salaryGrowthRate: 0.04,
  },
};

const INTEREST_RATE = 0.05;
const LOAN_TERM_YEARS = 10;

function getNetPrice(college: CollegeInput, bracket: string): number {
  const byIncome = college.cost.netPriceByIncome?.[bracket];
  return byIncome ?? college.cost.avgNetPrice ?? 20000;
}

function calculateMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
         (Math.pow(1 + monthlyRate, numPayments) - 1);
}

function getYearLabel(year: number, path: typeof PROFESSIONAL_PATHS[ProfessionalPath]): { label: string; phase: TimelineYear["phase"]; milestone: string } {
  const { undergradYears, gradYears, residencyYears } = path;
  const totalSchoolYears = undergradYears + gradYears + residencyYears;

  if (year <= undergradYears) {
    const labels = ["Freshman", "Sophomore", "Junior", "Senior"];
    return {
      label: labels[year - 1] || `Undergrad Year ${year}`,
      phase: "undergrad",
      milestone: year === 1 ? "Start college" : year === undergradYears ? "Graduate undergrad" : "",
    };
  }

  if (year <= undergradYears + gradYears) {
    const gradYear = year - undergradYears;
    return {
      label: `Grad School Year ${gradYear}`,
      phase: "grad_school",
      milestone: gradYear === 1 ? "Start grad school" : gradYear === gradYears ? "Complete grad school" : "",
    };
  }

  if (year <= totalSchoolYears) {
    const resYear = year - undergradYears - gradYears;
    return {
      label: `Residency Year ${resYear}`,
      phase: "residency",
      milestone: resYear === 1 ? "Start residency" : resYear === residencyYears ? "Complete residency" : "",
    };
  }

  const careerYear = year - totalSchoolYears;
  return {
    label: `Career Year ${careerYear}`,
    phase: "career",
    milestone: careerYear === 1 ? "Start full career" : "",
  };
}

function calculateEarnings(
  year: number,
  path: typeof PROFESSIONAL_PATHS[ProfessionalPath],
  baseEarnings: number
): number {
  const { undergradYears, gradYears, residencyYears, peakSalary, salaryGrowthRate } = path;
  const totalSchoolYears = undergradYears + gradYears;

  // During undergrad: no earnings
  if (year <= undergradYears) return 0;

  // During grad school: minimal (stipend for PhD, nothing for others)
  if (year <= undergradYears + gradYears) {
    if (path.name === "PhD") return 30000; // PhD stipend
    return 0;
  }

  // During residency (medical only)
  if (year <= totalSchoolYears + residencyYears) {
    return 60000; // Residency salary
  }

  // Career phase
  const careerYear = year - totalSchoolYears - residencyYears;

  // Start at base salary, grow toward peak
  if (path.name === "Bachelor's Degree") {
    // Use college's actual earnings data
    return baseEarnings * Math.pow(1 + salaryGrowthRate, careerYear - 1);
  }

  // Professional paths start at higher salary
  const startingSalary = peakSalary * 0.7;
  return Math.min(
    peakSalary,
    startingSalary * Math.pow(1 + salaryGrowthRate, careerYear - 1)
  );
}

export async function POST(request: NextRequest) {
  try {
    const body: OutcomeRequest = await request.json();
    const { college, incomeBracket, professionalPath = "bachelors" } = body;

    if (!college) {
      return NextResponse.json({ error: "College data required" }, { status: 400 });
    }

    const path = PROFESSIONAL_PATHS[professionalPath];
    const { undergradYears, gradYears, residencyYears, gradCostPerYear, additionalDebt } = path;
    const totalSchoolYears = undergradYears + gradYears + residencyYears;

    // Calculate timeline length (school years + career years up to 15 years total or 6 years career)
    const careerYearsToShow = Math.max(6, 15 - totalSchoolYears);
    const totalYears = totalSchoolYears + careerYearsToShow;

    const netPricePerYear = getNetPrice(college, incomeBracket);
    const undergradTuition = netPricePerYear * undergradYears;
    const gradTuition = gradCostPerYear * gradYears;
    const totalTuition = undergradTuition + gradTuition;

    // Total debt = undergrad debt + grad school debt
    const undergradDebt = college.debt.medianDebt ?? Math.round(undergradTuition * 0.6);
    const totalDebt = undergradDebt + additionalDebt;

    const monthlyPayment = calculateMonthlyPayment(totalDebt, INTEREST_RATE, LOAN_TERM_YEARS);
    const annualPayment = monthlyPayment * 12;

    const timeline: TimelineYear[] = [];
    let cumulativeTuition = 0;
    let debtWithInterest = 0;
    let totalEarnings = 0;
    let totalLoanPaid = 0;
    let remainingDebt = 0;
    let breakEvenYear: number | null = null;

    const baseCareerEarnings = college.earnings.median10yr ?? 55000;

    for (let year = 1; year <= totalYears; year++) {
      const { label, phase, milestone } = getYearLabel(year, path);

      let tuitionThisYear = 0;
      let earnings: number | null = null;
      let loanPayment: number | null = null;
      let netIncome: number | null = null;

      if (phase === "undergrad") {
        tuitionThisYear = netPricePerYear;
        cumulativeTuition += tuitionThisYear;
        debtWithInterest = cumulativeTuition * Math.pow(1 + INTEREST_RATE, year);

        if (year === undergradYears) {
          debtWithInterest = undergradDebt;
          remainingDebt = undergradDebt;
        }
      } else if (phase === "grad_school") {
        tuitionThisYear = gradCostPerYear;
        cumulativeTuition += tuitionThisYear;
        const yearsInGrad = year - undergradYears;
        debtWithInterest = remainingDebt * Math.pow(1 + INTEREST_RATE, yearsInGrad) +
                          (gradCostPerYear * yearsInGrad);

        earnings = calculateEarnings(year, path, baseCareerEarnings);
        if (earnings > 0) totalEarnings += earnings;

        if (year === undergradYears + gradYears) {
          debtWithInterest = totalDebt;
          remainingDebt = totalDebt;
        }
      } else if (phase === "residency") {
        earnings = calculateEarnings(year, path, baseCareerEarnings);
        totalEarnings += earnings;

        // During residency, debt grows (income-based repayment often minimal)
        debtWithInterest = remainingDebt * (1 + INTEREST_RATE);
        remainingDebt = debtWithInterest;
        netIncome = earnings;
      } else {
        // Career phase
        earnings = calculateEarnings(year, path, baseCareerEarnings);
        totalEarnings += earnings;

        if (remainingDebt > 0) {
          loanPayment = Math.min(annualPayment, remainingDebt * (1 + INTEREST_RATE));
          remainingDebt = Math.max(0, remainingDebt * (1 + INTEREST_RATE) - loanPayment);
          totalLoanPaid += loanPayment;
        } else {
          loanPayment = 0;
        }

        debtWithInterest = remainingDebt;
        netIncome = earnings - (loanPayment || 0);
      }

      const netWorth = totalEarnings - debtWithInterest;

      if (breakEvenYear === null && netWorth > 0) {
        breakEvenYear = year;
      }

      timeline.push({
        year,
        label,
        phase,
        tuitionPaidThisYear: tuitionThisYear,
        cumulativeTuition,
        debtWithInterest: Math.round(debtWithInterest),
        earnings: earnings ? Math.round(earnings) : null,
        loanPayment: loanPayment ? Math.round(loanPayment) : null,
        netIncome: netIncome ? Math.round(netIncome) : null,
        netWorth: Math.round(netWorth),
        milestone,
      });
    }

    const yearsToPayoff = totalDebt > 0 ? Math.ceil(totalDebt / annualPayment) : 0;
    const roiAtEnd = totalEarnings - totalTuition - totalLoanPaid;

    const summary: OutcomeSummary = {
      totalCost: Math.round(totalTuition),
      totalDebt: Math.round(totalDebt),
      breakEvenYear,
      roiAtEnd: Math.round(roiAtEnd),
      monthlyPayment: Math.round(monthlyPayment),
      yearsToPayoff: Math.min(yearsToPayoff, LOAN_TERM_YEARS + 5),
      path: path.name,
      totalYears,
    };

    return NextResponse.json({
      success: true,
      college: { id: college.id, name: college.name },
      professionalPath,
      timeline,
      summary,
    });
  } catch (error) {
    console.error("Outcome generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate outcomes", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
