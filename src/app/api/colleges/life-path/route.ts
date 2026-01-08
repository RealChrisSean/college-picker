import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Cache for career data lookups (in-memory, resets on server restart)
const careerDataCache = new Map<string, CareerData>();

interface CareerData {
  title: string;
  medianSalary: number;
  salaryLow: number;
  salaryHigh: number;
  growthRate: number;
  educationYears: number;
  trainingYears: number;
  requiresGradSchool: boolean;
  gradSchoolYears: number;
  gradCostPerYear: number;
  residencyYears: number;
  residencySalary: number;
  notes: string | null;
}

// Get career data from Claude AI
async function getCareerDataFromAI(careerText: string, state?: string, city?: string): Promise<CareerData> {
  // Check cache first
  const cacheKey = `${careerText.toLowerCase()}-${state || ""}-${city || ""}`;
  if (careerDataCache.has(cacheKey)) {
    return careerDataCache.get(cacheKey)!;
  }

  const locationContext = city && state ? `in ${city}, ${state}` : state ? `in ${state}` : "in the United States";

  const prompt = `You are a career salary data expert with knowledge of BLS (Bureau of Labor Statistics) occupational data.

Given the career: "${careerText}" ${locationContext}

Return ONLY a JSON object with accurate salary and career path data. Use real BLS data where available, adjusted for location. Be accurate - this affects financial planning decisions.

{
  "title": "standardized job title",
  "medianSalary": annual median salary as number (location-adjusted),
  "salaryLow": 25th percentile salary as number,
  "salaryHigh": 75th percentile salary as number,
  "growthRate": 10-year job growth rate as number (e.g., 5 for 5%),
  "educationYears": years of college required (0-8),
  "trainingYears": additional training after degree (0 for most jobs),
  "requiresGradSchool": true/false,
  "gradSchoolYears": years of grad school if required (0 if not),
  "gradCostPerYear": annual grad school cost if required (0 if not),
  "residencyYears": medical/clinical residency years (0 for non-medical),
  "residencySalary": annual residency salary if applicable (0 if not),
  "notes": "brief note about career path or null"
}

Examples:
- "brain surgeon" → Neurosurgeon, ~$650k median, 4yr med school + 7yr residency
- "nurse practitioner" → ~$126k median, requires master's degree
- "police officer" → ~$74k median, academy training
- "software engineer" → ~$132k median, bachelor's degree

Return ONLY the JSON object, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse the JSON response
    let jsonText = textContent.text.trim();
    // Remove markdown code blocks if present
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    else if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const data = JSON.parse(jsonText) as CareerData;

    // Validate and set defaults for missing fields
    const validatedData: CareerData = {
      title: data.title || careerText,
      medianSalary: data.medianSalary || 50000,
      salaryLow: data.salaryLow || data.medianSalary * 0.7 || 35000,
      salaryHigh: data.salaryHigh || data.medianSalary * 1.4 || 70000,
      growthRate: data.growthRate ?? 4,
      educationYears: data.educationYears ?? 4,
      trainingYears: data.trainingYears ?? 0,
      requiresGradSchool: data.requiresGradSchool ?? false,
      gradSchoolYears: data.gradSchoolYears ?? 0,
      gradCostPerYear: data.gradCostPerYear ?? 0,
      residencyYears: data.residencyYears ?? 0,
      residencySalary: data.residencySalary ?? 0,
      notes: data.notes || null,
    };

    // Cache the result
    careerDataCache.set(cacheKey, validatedData);

    return validatedData;
  } catch (error) {
    console.error("Error getting career data from AI:", error);

    // Return fallback data
    return {
      title: careerText,
      medianSalary: 55000,
      salaryLow: 40000,
      salaryHigh: 75000,
      growthRate: 4,
      educationYears: 4,
      trainingYears: 0,
      requiresGradSchool: false,
      gradSchoolYears: 0,
      gradCostPerYear: 0,
      residencyYears: 0,
      residencySalary: 0,
      notes: "Using estimated data - career lookup failed",
    };
  }
}

interface StudentProfile {
  incomeBracket: string;
  homeState: string;
  intendedMajor: string;
  careerGoal: string;
  hasScholarships: boolean;
  scholarshipAmount: number;
  currentAge?: number;
}

interface CollegeInput {
  id: number;
  name: string;
  city: string;
  state: string;
  ownership: "public" | "private_nonprofit" | "private_forprofit";
  cost: {
    tuitionInState: number | null;
    tuitionOutOfState: number | null;
    roomBoardOnCampus: number | null;
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

interface LifePathRequest {
  colleges: CollegeInput[];
  profile: StudentProfile;
}

interface LifePathYear {
  year: number;
  age: number;
  phase: string;
  description: string;
  earnings: number | null;
  debt: number;
  netWorth: number;
}

interface LifePath {
  college: { id: number; name: string; city: string; state: string };
  major: string;
  majorEarnings: number | null;
  occupation: {
    title: string;
    medianSalary: number;
    salaryRange: { low: number; high: number };
    growthRate: number;
    isLocationAdjusted: boolean;
    location: string;
  };
  timeline: LifePathYear[];
  summary: {
    totalCost: number;
    costBreakdown: {
      undergradWithRoomBoard: number;
      undergradTuitionOnly: number;
      gradSchoolCost: number;
      aidAdjustedUndergrad: number | null; // only shown for low-income families
    };
    peakDebt: number;
    breakEvenAge: number | null;
    netWorthAt35: number;
    warning?: string;
  };
}

// Major to expected earnings multiplier (relative to school median)
const MAJOR_EARNINGS_MULTIPLIERS: Record<string, { multiplier: number; label: string }> = {
  // Tech/Engineering
  computer_science: { multiplier: 1.8, label: "Computer Science" },
  engineering: { multiplier: 1.5, label: "Engineering" },
  // Business
  business: { multiplier: 1.3, label: "Business" },
  accounting: { multiplier: 1.25, label: "Accounting" },
  finance: { multiplier: 1.35, label: "Finance" },
  marketing: { multiplier: 1.1, label: "Marketing" },
  // Healthcare
  health_premed: { multiplier: 1.1, label: "Pre-Med / Health Sciences" },
  nursing: { multiplier: 1.15, label: "Nursing" },
  pharmacy: { multiplier: 1.2, label: "Pharmacy" },
  dental_hygiene: { multiplier: 1.0, label: "Dental Hygiene" },
  // Sciences
  biology: { multiplier: 0.9, label: "Biology" },
  physical_sciences: { multiplier: 1.2, label: "Physical Sciences" },
  math: { multiplier: 1.3, label: "Mathematics" },
  // Social Sciences
  social_sciences: { multiplier: 0.85, label: "Social Sciences" },
  psychology: { multiplier: 0.8, label: "Psychology" },
  criminal_justice: { multiplier: 0.85, label: "Criminal Justice" },
  social_work: { multiplier: 0.75, label: "Social Work" },
  // Humanities/Arts
  humanities: { multiplier: 0.75, label: "Humanities" },
  arts: { multiplier: 0.65, label: "Fine Arts" },
  communications: { multiplier: 0.9, label: "Communications" },
  journalism: { multiplier: 0.85, label: "Journalism" },
  // Education
  education: { multiplier: 0.7, label: "Education" },
  // Trades/Vocational
  trades: { multiplier: 1.0, label: "Trades/Vocational" },
  culinary: { multiplier: 0.7, label: "Culinary Arts" },
  cosmetology: { multiplier: 0.6, label: "Cosmetology" },
  automotive: { multiplier: 0.9, label: "Automotive Technology" },
  // Other
  architecture: { multiplier: 1.1, label: "Architecture" },
  agriculture: { multiplier: 0.85, label: "Agriculture" },
  hospitality: { multiplier: 0.8, label: "Hospitality Management" },
  undecided: { multiplier: 1.0, label: "Undecided" },
};

// Map freeform text to major category using keyword matching
function matchMajorFromText(text: string): string {
  const lower = text.toLowerCase().trim();

  // Direct key match first
  if (MAJOR_EARNINGS_MULTIPLIERS[lower]) {
    return lower;
  }

  // Keyword patterns -> major category
  const patterns: [RegExp, string][] = [
    // Nursing
    [/\b(nursing|nurse|rn|bsn|lpn|registered nurse|nurse practitioner)\b/i, "nursing"],
    // Computer Science / Tech
    [/\b(computer|software|programming|coding|developer|data science|cs|it|information technology|cyber|web dev|machine learning|ai|artificial intelligence)\b/i, "computer_science"],
    // Engineering
    [/\b(engineer|engineering|mechanical|electrical|civil|chemical|aerospace|biomedical|industrial)\b/i, "engineering"],
    // Finance
    [/\b(finance|financial|investment|banking|economics|econ)\b/i, "finance"],
    // Marketing
    [/\b(marketing|advertising|brand|digital marketing)\b/i, "marketing"],
    // Business (general)
    [/\b(business|management|mba|entrepreneur|administration)\b/i, "business"],
    // Accounting
    [/\b(accounting|accountant|cpa|bookkeeping)\b/i, "accounting"],
    // Pharmacy
    [/\b(pharmacy|pharmacist|pharmd|pharmaceutical)\b/i, "pharmacy"],
    // Dental Hygiene
    [/\b(dental hygien|dental assistant)\b/i, "dental_hygiene"],
    // Pre-Med / Health
    [/\b(pre-?med|premed|medicine|doctor|physician|medical|health science|healthcare admin|public health)\b/i, "health_premed"],
    // Biology
    [/\b(biology|bio|biochem|microbiology|molecular|genetics|neuroscience)\b/i, "biology"],
    // Math
    [/\b(math|mathematics|statistics|actuarial)\b/i, "math"],
    // Physical Sciences
    [/\b(physics|chemistry|astronomy|geology|earth science|environmental science)\b/i, "physical_sciences"],
    // Psychology
    [/\b(psychology|psych|behavioral science)\b/i, "psychology"],
    // Social Work
    [/\b(social work|lcsw|msw|bsw)\b/i, "social_work"],
    // Social Sciences
    [/\b(sociology|political science|anthropology|international relations|government|poli sci)\b/i, "social_sciences"],
    // Criminal Justice
    [/\b(criminal justice|criminology|law enforcement|police|forensic|corrections)\b/i, "criminal_justice"],
    // Education
    [/\b(education|teaching|teacher|pedagogy|elementary|secondary|early childhood)\b/i, "education"],
    // Journalism
    [/\b(journalism|reporter|news|broadcast journalism)\b/i, "journalism"],
    // Humanities
    [/\b(english|history|philosophy|literature|language|classics|religious studies|liberal arts)\b/i, "humanities"],
    // Arts
    [/\b(art|music|theater|theatre|film|graphic design|creative|photography|dance|studio art|fine art)\b/i, "arts"],
    // Communications
    [/\b(communications|media|public relations|broadcasting|speech)\b/i, "communications"],
    // Architecture
    [/\b(architecture|architect|interior design|urban planning|landscape design)\b/i, "architecture"],
    // Trades
    [/\b(electrician|plumber|hvac|welding|welder|construction|carpentry|carpenter|machinist|cnc)\b/i, "trades"],
    // Automotive
    [/\b(automotive|auto mechanic|diesel|collision|auto tech)\b/i, "automotive"],
    // Culinary
    [/\b(culinary|chef|cooking|pastry|baking|food service)\b/i, "culinary"],
    // Cosmetology
    [/\b(cosmetology|hair|stylist|esthetician|beauty|barber|nail tech|makeup)\b/i, "cosmetology"],
    // Agriculture
    [/\b(agriculture|farming|agribusiness|horticulture|animal science)\b/i, "agriculture"],
    // Hospitality
    [/\b(hospitality|hotel|tourism|event management|restaurant management)\b/i, "hospitality"],
  ];

  for (const [pattern, category] of patterns) {
    if (pattern.test(lower)) {
      return category;
    }
  }

  return "undecided";
}

// Map freeform text to career category using keyword matching
function matchCareerFromText(text: string): string {
  const lower = text.toLowerCase().trim();

  // Direct key match first
  if (CAREER_PATH_CONFIG[lower]) {
    return lower;
  }

  // Keyword patterns -> career category
  const patterns: [RegExp, string][] = [
    // Nursing
    [/\b(nursing|nurse|rn|bsn|lpn|registered nurse|nurse practitioner|np)\b/i, "nursing"],
    // Tech/Engineering
    [/\b(software|developer|programmer|engineer|coding|web dev|data scientist|devops|sysadmin|network admin|database|dba|qa|tester|cybersecurity|cloud|backend|frontend|full stack|machine learning|ai engineer)\b/i, "tech_engineer"],
    // Product/PM
    [/\b(product manager|pm|product owner|ux|ui designer|scrum master|agile)\b/i, "tech_pm"],
    // Data/Analytics
    [/\b(data analyst|business analyst|analytics|statistician|actuary|quantitative)\b/i, "data_analyst"],
    // Finance
    [/\b(finance|banker|investment|trading|wall street|hedge fund|private equity|venture capital|financial advisor|wealth management|cfo)\b/i, "finance"],
    // Accounting
    [/\b(accountant|accounting|cpa|auditor|tax|bookkeeper)\b/i, "accounting"],
    // Consulting
    [/\b(consultant|consulting|mckinsey|bain|bcg|deloitte|pwc|kpmg|ey|accenture)\b/i, "consulting"],
    // Neurosurgery (must be before general surgery/medicine)
    [/\b(neurosurgeon|neurosurgery|brain surgeon|brain surgery)\b/i, "neurosurgery"],
    // Surgery (must be before general medicine)
    [/\b(surgeon|surgery|surgical|orthopedic surgeon|cardiac surgeon|trauma surgeon|plastic surgeon|general surgery)\b/i, "surgery"],
    // Medicine (MD/DO)
    [/\b(doctor|physician|md|do|medical doctor|pediatrician|cardiologist|dermatologist|psychiatrist|oncologist|anesthesiologist|radiologist)\b/i, "medicine"],
    // Dentistry
    [/\b(dentist|dental|orthodontist|oral surgeon|periodontist)\b/i, "dentistry"],
    // Pharmacy
    [/\b(pharmacist|pharmacy|pharmd)\b/i, "pharmacy"],
    // Veterinary
    [/\b(veterinarian|vet|veterinary|animal doctor)\b/i, "veterinary"],
    // Optometry
    [/\b(optometrist|optometry|eye doctor)\b/i, "optometry"],
    // Physical/Occupational Therapy
    [/\b(physical therapist|pt|dpt|occupational therapist|ot|speech therapist|slp|rehab)\b/i, "therapy"],
    // Healthcare (non-doctoral)
    [/\b(healthcare|health care|medical assistant|technician|radiology|sonographer|phlebotomist|medical coder|health admin|hospital)\b/i, "healthcare"],
    // Dental/Vet/Pharm Tech
    [/\b(dental hygienist|dental assistant|vet tech|veterinary tech|pharmacy tech|lab tech)\b/i, "healthcare_tech"],
    // Law
    [/\b(lawyer|attorney|legal|paralegal|judge|prosecutor|public defender|corporate counsel)\b/i, "law"],
    // Academia/Research
    [/\b(professor|academia|phd|research|scientist|researcher|postdoc)\b/i, "academia"],
    // Teaching K-12
    [/\b(teacher|teaching|educator|principal|school|tutor|special education)\b/i, "teaching"],
    // Social Work/Counseling
    [/\b(social worker|counselor|therapist|mental health|case manager|family services|child welfare|lcsw|lmft)\b/i, "social_work"],
    // Creative/Arts
    [/\b(artist|musician|writer|filmmaker|photographer|actor|actress|animator|video editor|graphic design|illustrator|creative director)\b/i, "creative"],
    // Media/Entertainment
    [/\b(content creator|influencer|streamer|youtuber|podcaster|social media|journalist|reporter|news|broadcasting)\b/i, "media"],
    // Entrepreneur
    [/\b(entrepreneur|startup|founder|business owner|self-employed|freelance|small business)\b/i, "entrepreneur"],
    // Government/Public Sector
    [/\b(government|federal|public sector|civil servant|policy|diplomat|city planner|urban planner)\b/i, "government"],
    // Trades
    [/\b(electrician|plumber|hvac|carpenter|mechanic|welder|construction|contractor|trades|lineman|ironworker|machinist|cnc|heavy equipment|crane operator|roofer|painter|mason)\b/i, "trades"],
    // Automotive
    [/\b(auto mechanic|automotive|car|diesel|collision repair|body shop)\b/i, "trades"],
    // Police/First Responder
    [/\b(police|cop|officer|firefighter|emt|paramedic|first responder|detective|sheriff|state trooper|corrections|prison)\b/i, "first_responder"],
    // Military
    [/\b(military|army|navy|air force|marines|coast guard|national guard|veteran|enlisted|officer)\b/i, "military"],
    // Aviation
    [/\b(pilot|aviation|airline|flight attendant|air traffic|aerospace)\b/i, "aviation"],
    // Transportation/Logistics
    [/\b(truck driver|trucker|cdl|logistics|supply chain|warehouse|shipping|delivery|ups|fedex|amazon)\b/i, "logistics"],
    // Real Estate
    [/\b(real estate|realtor|property|broker|mortgage|appraiser)\b/i, "real_estate"],
    // Sales
    [/\b(sales|account executive|ae|business development|bdr|sdr|retail|store manager)\b/i, "sales"],
    // HR/Operations
    [/\b(human resources|hr|recruiter|talent|operations|office manager|administrative|executive assistant|project manager|pmp)\b/i, "corporate"],
    // Marketing
    [/\b(marketing|brand|advertising|seo|growth|digital marketing|pr|public relations|communications)\b/i, "marketing"],
    // Architecture/Design
    [/\b(architect|architecture|interior design|landscape architect)\b/i, "architecture"],
    // Hospitality/Culinary
    [/\b(chef|cook|culinary|restaurant|hotel|hospitality|event planner|catering|bartender|sommelier)\b/i, "hospitality"],
    // Fitness/Wellness
    [/\b(personal trainer|fitness|gym|coach|athletic trainer|sports|yoga|pilates|nutritionist|dietitian)\b/i, "fitness"],
    // Beauty/Cosmetology
    [/\b(cosmetologist|hair stylist|barber|esthetician|nail tech|makeup artist|beauty|salon|spa)\b/i, "beauty"],
    // Agriculture
    [/\b(farmer|farming|agriculture|rancher|agricultural|agribusiness)\b/i, "agriculture"],
    // Non-profit
    [/\b(non-?profit|ngo|charity|foundation|advocacy|community organizer)\b/i, "nonprofit"],
  ];

  for (const [pattern, category] of patterns) {
    if (pattern.test(lower)) {
      return category;
    }
  }

  return "not_sure";
}

// Career path adjustments
const CAREER_PATH_CONFIG: Record<string, {
  requiresGradSchool: boolean;
  gradYears: number;
  gradCostPerYear: number;
  additionalDebt: number;
  postGradEarnings: number;
  description: string;
}> = {
  tech_engineer: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Start earning immediately after college",
  },
  tech_pm: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Start earning immediately after college",
  },
  finance: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Start earning immediately, may get MBA later",
  },
  consulting: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Start earning immediately",
  },
  medicine: {
    requiresGradSchool: true,
    gradYears: 4,
    gradCostPerYear: 60000,
    additionalDebt: 200000,
    postGradEarnings: 60000, // residency
    description: "4 years med school + 4 years residency",
  },
  surgery: {
    requiresGradSchool: true,
    gradYears: 4,
    gradCostPerYear: 60000,
    additionalDebt: 200000,
    postGradEarnings: 65000, // surgical residency pays slightly more
    description: "4 years med school + 5-7 years surgical residency",
  },
  neurosurgery: {
    requiresGradSchool: true,
    gradYears: 4,
    gradCostPerYear: 60000,
    additionalDebt: 200000,
    postGradEarnings: 70000, // neurosurgery residency
    description: "4 years med school + 7 years neurosurgery residency",
  },
  healthcare: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Start earning after college",
  },
  nursing: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Start earning after nursing degree",
  },
  law: {
    requiresGradSchool: true,
    gradYears: 3,
    gradCostPerYear: 55000,
    additionalDebt: 145000,
    postGradEarnings: 0,
    description: "3 years law school",
  },
  academia: {
    requiresGradSchool: true,
    gradYears: 5,
    gradCostPerYear: 0, // usually funded
    additionalDebt: 0,
    postGradEarnings: 30000, // stipend
    description: "5+ years PhD (usually funded)",
  },
  teaching: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Start teaching after college",
  },
  creative: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Freelance or entry-level creative work",
  },
  entrepreneur: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Variable - could be $0 or millions",
  },
  government: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Stable government salary",
  },
  not_sure: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Using general earnings data",
  },
  trades: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Apprenticeship or trade school path",
  },
  first_responder: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Police, fire, or EMS career",
  },
  military: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Military service",
  },
  real_estate: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Real estate and property",
  },
  sales: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Sales and business development",
  },
  dentistry: {
    requiresGradSchool: true,
    gradYears: 4,
    gradCostPerYear: 70000,
    additionalDebt: 280000,
    postGradEarnings: 0,
    description: "4 years dental school",
  },
  pharmacy: {
    requiresGradSchool: true,
    gradYears: 4,
    gradCostPerYear: 40000,
    additionalDebt: 160000,
    postGradEarnings: 0,
    description: "4 years pharmacy school",
  },
  veterinary: {
    requiresGradSchool: true,
    gradYears: 4,
    gradCostPerYear: 50000,
    additionalDebt: 180000,
    postGradEarnings: 0,
    description: "4 years vet school",
  },
  optometry: {
    requiresGradSchool: true,
    gradYears: 4,
    gradCostPerYear: 45000,
    additionalDebt: 180000,
    postGradEarnings: 0,
    description: "4 years optometry school",
  },
  therapy: {
    requiresGradSchool: true,
    gradYears: 3,
    gradCostPerYear: 30000,
    additionalDebt: 80000,
    postGradEarnings: 0,
    description: "Doctorate in PT/OT/SLP",
  },
  healthcare_tech: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Certificate or associate degree",
  },
  social_work: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "BSW or MSW path",
  },
  media: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Content creation and media",
  },
  data_analyst: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Data and analytics",
  },
  accounting: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Accounting and finance",
  },
  aviation: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 50000, // flight training
    postGradEarnings: 0,
    description: "Pilot training and aviation",
  },
  logistics: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Transportation and logistics",
  },
  corporate: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "HR, operations, admin roles",
  },
  marketing: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Marketing and communications",
  },
  architecture: {
    requiresGradSchool: true,
    gradYears: 2,
    gradCostPerYear: 40000,
    additionalDebt: 60000,
    postGradEarnings: 0,
    description: "Architecture degree + internship",
  },
  hospitality: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Hospitality and culinary",
  },
  fitness: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Fitness and wellness",
  },
  beauty: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 10000, // cosmetology school
    postGradEarnings: 0,
    description: "Cosmetology license",
  },
  agriculture: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Farming and agriculture",
  },
  nonprofit: {
    requiresGradSchool: false,
    gradYears: 0,
    gradCostPerYear: 0,
    additionalDebt: 0,
    postGradEarnings: 0,
    description: "Non-profit sector",
  },
};

// Final career earnings by path
const CAREER_PEAK_EARNINGS: Record<string, number> = {
  // Tech
  tech_engineer: 180000,
  tech_pm: 200000,
  data_analyst: 110000,
  // Business
  finance: 200000,
  consulting: 180000,
  accounting: 90000,
  sales: 100000,
  marketing: 95000,
  corporate: 85000,
  real_estate: 90000,
  entrepreneur: 100000,
  // Healthcare - Doctoral
  medicine: 280000,
  dentistry: 180000,
  pharmacy: 130000,
  veterinary: 110000,
  optometry: 125000,
  // Healthcare - Other
  nursing: 85000,
  therapy: 90000, // PT/OT/SLP
  healthcare: 75000,
  healthcare_tech: 55000, // dental hygienist, vet tech, etc.
  // Professional
  law: 150000,
  architecture: 100000,
  // Education/Social
  academia: 100000,
  teaching: 55000,
  social_work: 55000,
  nonprofit: 60000,
  // Creative/Media
  creative: 60000,
  media: 70000,
  // Service/Trades
  trades: 75000,
  hospitality: 55000,
  fitness: 50000,
  beauty: 45000,
  agriculture: 55000,
  // Public Service
  government: 80000,
  first_responder: 70000,
  military: 65000,
  // Transportation
  aviation: 120000, // airline pilot
  logistics: 55000,
  // Default
  not_sure: 65000,
};

// Get sticker price (tuition + room & board) - this is what you actually pay
function getStickerPrice(college: CollegeInput, isInState: boolean, includeRoomBoard: boolean): number {
  const tuition = isInState
    ? (college.cost.tuitionInState ?? college.cost.tuitionOutOfState ?? 15000)
    : (college.cost.tuitionOutOfState ?? college.cost.tuitionInState ?? 30000);

  const roomBoard = includeRoomBoard ? (college.cost.roomBoardOnCampus ?? 15000) : 0;
  return tuition + roomBoard;
}

// Get aid-adjusted price based on family income bracket
function getAidAdjustedPrice(college: CollegeInput, bracket: string): number | null {
  const byIncome = college.cost.netPriceByIncome?.[bracket];
  return byIncome ?? college.cost.avgNetPrice ?? null;
}

async function generateLifePath(college: CollegeInput, profile: StudentProfile, careerData: CareerData): Promise<LifePath> {
  // Match freeform text to major category (still useful for major-specific adjustments)
  const matchedMajor = matchMajorFromText(profile.intendedMajor || "");
  const majorConfig = MAJOR_EARNINGS_MULTIPLIERS[matchedMajor];

  // Use AI-provided career data instead of hardcoded configs

  // Determine if student is in-state
  const isInState = profile.homeState.toUpperCase() === college.state.toUpperCase();

  // Calculate costs using sticker price (tuition + room & board)
  const stickerPriceWithRB = getStickerPrice(college, isInState, true);
  const stickerPriceTuitionOnly = getStickerPrice(college, isInState, false);

  // For total cost calculation, use sticker price with room & board
  const undergradCostWithRB = stickerPriceWithRB * 4;
  const undergradCostTuitionOnly = stickerPriceTuitionOnly * 4;

  // Get aid-adjusted price for low-income families
  const aidAdjustedPerYear = getAidAdjustedPrice(college, profile.incomeBracket);
  const aidAdjustedUndergrad = aidAdjustedPerYear ? aidAdjustedPerYear * 4 : null;

  const scholarshipOffset = profile.hasScholarships ? profile.scholarshipAmount : 0;
  const adjustedUndergradCost = Math.max(0, undergradCostWithRB - scholarshipOffset);

  // Calculate debt based on sticker price (assume 60% is borrowed)
  const undergradDebt = Math.round(adjustedUndergradCost * 0.6);
  const gradDebt = careerData.gradCostPerYear * careerData.gradSchoolYears;
  const totalDebt = undergradDebt + gradDebt;

  // Use AI-provided salary data
  const majorAdjustedEarnings = careerData.medianSalary;

  // Generate timeline
  const timeline: LifePathYear[] = [];
  let cumulativeDebt = 0;
  let cumulativeEarnings = 0;
  let peakDebt = 0;
  let breakEvenAge: number | null = null;
  const startAge = profile.currentAge || 18;
  const projectionEndAge = startAge + 17; // Project 17 years forward (4 years college + 13 years career)

  // Undergrad years (18-21)
  for (let year = 1; year <= 4; year++) {
    const age = startAge + year - 1;
    cumulativeDebt += stickerPriceWithRB * 0.6; // accumulating debt (assuming 60% is financed)
    peakDebt = Math.max(peakDebt, cumulativeDebt);

    timeline.push({
      year,
      age,
      phase: "College",
      description: year === 1 ? "Starting undergrad" : year === 4 ? "Senior year, preparing to graduate" : `Year ${year} of undergrad`,
      earnings: null,
      debt: Math.round(cumulativeDebt),
      netWorth: -Math.round(cumulativeDebt),
    });
  }

  // Keep the accumulated debt from undergrad (don't reset to database median)
  // cumulativeDebt already has the correct accumulated value from the loop
  peakDebt = Math.max(peakDebt, cumulativeDebt);

  // Grad school years if applicable (using AI career data)
  if (careerData.requiresGradSchool && careerData.gradSchoolYears > 0) {
    for (let year = 1; year <= careerData.gradSchoolYears; year++) {
      const age = 22 + year - 1;
      const yearNum = 4 + year;
      cumulativeDebt += careerData.gradCostPerYear;

      peakDebt = Math.max(peakDebt, cumulativeDebt);

      // Determine description based on career type
      let description = `Grad school year ${year}`;
      const careerLower = careerData.title.toLowerCase();
      if (careerLower.includes("surgeon") || careerLower.includes("physician") || careerLower.includes("doctor")) {
        description = `Med school year ${year}`;
      } else if (careerLower.includes("lawyer") || careerLower.includes("attorney")) {
        description = `Law school year ${year}`;
      } else if (careerLower.includes("professor") || careerLower.includes("phd") || careerLower.includes("researcher")) {
        description = `PhD year ${year} (stipend)`;
      }

      timeline.push({
        year: yearNum,
        age,
        phase: "Grad School",
        description,
        earnings: null,
        debt: Math.round(cumulativeDebt),
        netWorth: Math.round(-cumulativeDebt),
      });
    }
  }

  // Add residency/training years if applicable (using AI career data)
  if (careerData.residencyYears > 0 && careerData.residencySalary > 0) {
    const gradSchoolEndAge = 22 + careerData.gradSchoolYears;
    for (let year = 1; year <= careerData.residencyYears; year++) {
      const age = gradSchoolEndAge + year - 1;
      const yearNum = 4 + careerData.gradSchoolYears + year;
      cumulativeEarnings += careerData.residencySalary;

      // Minimal debt repayment during residency
      cumulativeDebt = cumulativeDebt * 1.05 - 5000; // interest grows, small payments

      timeline.push({
        year: yearNum,
        age,
        phase: "Residency",
        description: `Residency year ${year} - working 80hr weeks`,
        earnings: careerData.residencySalary,
        debt: Math.round(Math.max(0, cumulativeDebt)),
        netWorth: Math.round(cumulativeEarnings - Math.max(0, cumulativeDebt)),
      });
    }
  }

  // Career years until projection end age
  // Calculate based on AI career data: undergrad (4) + grad school + residency/training
  const careerStartAge = startAge + 4 + careerData.gradSchoolYears + careerData.residencyYears;

  const yearsToShow = projectionEndAge - careerStartAge + 1;
  const currentYearNum = timeline.length;

  // Track accumulated savings (not raw earnings)
  let accumulatedSavings = 0;
  const SAVINGS_RATE = 0.15; // 15% of gross income saved
  const INVESTMENT_RETURN = 0.07; // 7% annual return on savings

  for (let careerYear = 1; careerYear <= yearsToShow; careerYear++) {
    const age = careerStartAge + careerYear - 1;
    if (age > projectionEndAge) break;

    const yearNum = currentYearNum + careerYear;

    // Calculate salary progression using AI career data
    // Entry level starts at low end, grows toward median then high over time
    const yearsExperience = careerYear - 1;
    let currentSalary: number;
    if (yearsExperience <= 0) {
      currentSalary = Math.round(careerData.salaryLow * 0.9);
    } else if (yearsExperience <= 2) {
      const progress = yearsExperience / 2;
      currentSalary = Math.round(careerData.salaryLow * 0.9 + (careerData.medianSalary - careerData.salaryLow * 0.9) * progress * 0.5);
    } else if (yearsExperience <= 5) {
      const progress = (yearsExperience - 2) / 3;
      const startSalary = careerData.salaryLow * 0.9 + (careerData.medianSalary - careerData.salaryLow * 0.9) * 0.5;
      currentSalary = Math.round(startSalary + (careerData.medianSalary - startSalary) * progress);
    } else if (yearsExperience <= 10) {
      const progress = (yearsExperience - 5) / 5;
      currentSalary = Math.round(careerData.medianSalary + (careerData.salaryHigh - careerData.medianSalary) * progress * 0.6);
    } else {
      const progress = Math.min((yearsExperience - 10) / 10, 1);
      const base = careerData.medianSalary + (careerData.salaryHigh - careerData.medianSalary) * 0.6;
      currentSalary = Math.round(base + (careerData.salaryHigh - base) * progress * 0.5);
    }

    // Debt repayment (10-year standard plan)
    const annualPayment = totalDebt > 0 ? Math.min(totalDebt / 10 * 1.5, cumulativeDebt) : 0;
    cumulativeDebt = Math.max(0, cumulativeDebt * 1.05 - annualPayment);

    // Calculate realistic savings after debt payment
    // After taxes (~25%) and living expenses, save 15% of gross
    const annualSavings = Math.max(0, currentSalary * SAVINGS_RATE - annualPayment);

    // Apply investment returns to existing savings, then add new savings
    accumulatedSavings = accumulatedSavings * (1 + INVESTMENT_RETURN) + annualSavings;

    // Net worth = savings - remaining debt
    const netWorth = accumulatedSavings - cumulativeDebt;

    if (breakEvenAge === null && netWorth > 0) {
      breakEvenAge = age;
    }

    timeline.push({
      year: yearNum,
      age,
      phase: "Career",
      description: careerYear === 1
        ? "First job"
        : `Career year ${careerYear}`,
      earnings: currentSalary,
      debt: Math.round(Math.max(0, cumulativeDebt)),
      netWorth: Math.round(netWorth),
    });
  }

  // Calculate net worth at end of projection
  const lastYear = timeline[timeline.length - 1];
  const netWorthAtEnd = lastYear?.netWorth || -totalDebt;

  // Generate warning if applicable
  let warning: string | undefined;

  const careerLower = careerData.title.toLowerCase();
  const isMedicalCareer = careerLower.includes("surgeon") || careerLower.includes("physician") || careerLower.includes("doctor");
  if (isMedicalCareer && matchedMajor !== "health_premed" && matchedMajor !== "biology") {
    warning = "Pre-med track is very competitive. Only ~40% of applicants get into med school.";
  } else if (totalDebt > majorAdjustedEarnings * 1.5) {
    warning = `High debt-to-earnings ratio. Your debt (${formatMoney(totalDebt)}) is more than 1.5x your expected first-year salary.`;
  } else if (matchedMajor === "arts" || matchedMajor === "humanities") {
    warning = "Earnings in this field vary widely. Consider internships and networking early.";
  } else if (careerData.notes) {
    warning = careerData.notes;
  }

  return {
    college: { id: college.id, name: college.name, city: college.city, state: college.state },
    major: majorConfig.label,
    majorEarnings: majorAdjustedEarnings,
    occupation: {
      title: careerData.title,
      medianSalary: careerData.medianSalary,
      salaryRange: {
        low: careerData.salaryLow,
        high: careerData.salaryHigh,
      },
      growthRate: careerData.growthRate,
      isLocationAdjusted: true, // AI provides location-adjusted data
      location: `${college.city}, ${college.state}`,
    },
    timeline,
    summary: {
      totalCost: Math.round(adjustedUndergradCost + careerData.gradCostPerYear * careerData.gradSchoolYears),
      costBreakdown: {
        undergradWithRoomBoard: Math.round(undergradCostWithRB),
        undergradTuitionOnly: Math.round(undergradCostTuitionOnly),
        gradSchoolCost: Math.round(careerData.gradCostPerYear * careerData.gradSchoolYears),
        aidAdjustedUndergrad: aidAdjustedUndergrad ? Math.round(aidAdjustedUndergrad) : null,
      },
      peakDebt: Math.round(peakDebt),
      breakEvenAge,
      netWorthAt35: Math.round(netWorthAtEnd),
      warning,
    },
  };
}

function formatMoney(val: number): string {
  return "$" + Math.round(val).toLocaleString();
}

export async function POST(request: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const body: LifePathRequest = await request.json();
    const { colleges, profile } = body;

    if (!colleges || colleges.length === 0) {
      return NextResponse.json({ error: "No colleges provided" }, { status: 400 });
    }

    // Fetch full college data from database
    const collegeIds = colleges.map(c => c.id);
    const placeholders = collegeIds.map(() => '?').join(',');

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, name, city, state, ownership,
              tuition_in_state, tuition_out_of_state, room_board_on_campus,
              avg_net_price,
              net_price_public_0_30000, net_price_public_30001_48000, net_price_public_48001_75000, net_price_public_75001_110000, net_price_public_110001_plus,
              net_price_private_0_30000, net_price_private_30001_48000, net_price_private_48001_75000, net_price_private_75001_110000, net_price_private_110001_plus,
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
        ownership: row.ownership,
        cost: {
          tuitionInState: row.tuition_in_state,
          tuitionOutOfState: row.tuition_out_of_state,
          roomBoardOnCampus: row.room_board_on_campus,
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
        debt: {
          medianDebt: row.median_debt,
        },
        earnings: {
          median6yr: row.earnings_6yr,
          median10yr: row.earnings_10yr,
        },
      };
    });

    // Get career data from AI once (same career for all colleges, but adjust for first college's location)
    const firstCollege = fullColleges[0];
    const careerData = await getCareerDataFromAI(
      profile.careerGoal || "general career",
      firstCollege?.state,
      firstCollege?.city
    );

    // Generate life paths for all colleges using the AI career data
    const paths = await Promise.all(
      fullColleges.map((college) => generateLifePath(college, profile, careerData))
    );

    return NextResponse.json({
      success: true,
      paths,
      careerData: {
        title: careerData.title,
        medianSalary: careerData.medianSalary,
        salaryRange: { low: careerData.salaryLow, high: careerData.salaryHigh },
        growthRate: careerData.growthRate,
      },
    });
  } catch (error) {
    console.error("Life path error:", error);
    return NextResponse.json(
      { error: "Failed to generate life paths", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
