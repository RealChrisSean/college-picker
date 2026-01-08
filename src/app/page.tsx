"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";

// Lazy load the tree component
const CollegeTree = lazy(() => import("./components/CollegeTree"));

// Dark mode hook
function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("college-picker-theme");
    if (stored) {
      setIsDark(stored === "dark");
    } else {
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("college-picker-theme", isDark ? "dark" : "light");
  }, [isDark]);

  return [isDark, setIsDark] as const;
}

// ============ TYPES ============

type AppMode = "chat" | "guided";

interface ChatCollegeData {
  id?: number;
  name: string;
  city?: string;
  state?: string;
  isGeneric?: boolean;
  cost: { avgNetPrice: number | null; tuitionInState?: number | null };
  debt: { medianDebt: number | null; monthlyPayment?: number | null };
  earnings: { median6yr: number | null; median10yr: number | null };
  outcomes: { graduationRate6yr: number | null };
  admissions?: { acceptanceRate: number | null };
  size?: number | null;
  ownership?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  collegeData?: ChatCollegeData[]; // Colleges detected in this message
  showLifePath?: boolean; // Expanded life path view
  showAnalysis?: boolean; // Expanded AI verdict view
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface GuideSession {
  id: string;
  title: string;
  colleges: CollegeData[];
  profile: StudentProfile;
  lifePaths: LifePath[];
  analysis: AnalysisResult | null;
  createdAt: number;
  updatedAt: number;
}

interface StudentProfile {
  incomeBracket: string;
  homeState: string;
  intendedMajor: string;
  careerGoal: string;
  priorities: string[];
  hasScholarships: boolean;
  scholarshipAmount: number;
  currentAge: number;
}

interface ProgramEarnings {
  title: string;
  credentialLevel: number;
  medianEarnings: number | null;
}

interface CollegeData {
  id: number;
  name: string;
  city: string;
  state: string;
  website: string | null;
  ownership: "public" | "private_nonprofit" | "private_forprofit";
  size: number | null;
  acceptanceRate: number | null;
  admissions: {
    acceptanceRate: number | null;
    satAverage: number | null;
    actAverage: number | null;
  };
  cost: {
    tuitionInState: number | null;
    tuitionOutOfState: number | null;
    roomBoardOnCampus: number | null;
    roomBoardOffCampus: number | null;
    books: number | null;
    costAttendance: number | null;
    avgNetPrice: number | null;
    netPriceByIncome: Record<string, number | null>;
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
  };
  programs?: ProgramEarnings[];
}

interface LifePathYear {
  year: number;
  age: number;
  phase: string;
  description: string;
  earnings: number | null;
  debt: number;
  netWorth: number;
  milestone?: string;
}

interface LifePath {
  college: CollegeData & { city?: string; state?: string };
  major: string;
  majorEarnings: number | null;
  occupation?: {
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
      aidAdjustedUndergrad: number | null;
    };
    peakDebt: number;
    breakEvenAge: number | null;
    netWorthAt35: number;
    warning?: string;
  };
}

interface CollegeAnalysis {
  id: number;
  name: string;
  verdict: "Excellent" | "Good" | "Fair" | "Poor";
  whyChoose: string[];
  whyNot: string[];
  bestFor: string;
  warning: string | null;
}

interface AnalysisResult {
  summary: string;
  colleges: CollegeAnalysis[];
  recommendation: string;
  alternativePath: string | null;
}

// ============ CONSTANTS ============

const INCOME_BRACKETS = [
  { value: "0-30000", label: "$0 - $30,000" },
  { value: "30001-48000", label: "$30,001 - $48,000" },
  { value: "48001-75000", label: "$48,001 - $75,000" },
  { value: "75001-110000", label: "$75,001 - $110,000" },
  { value: "110001-plus", label: "$110,001+" },
];

const MAJOR_CATEGORIES = [
  { value: "", label: "Select a field of study..." },
  { value: "computer_science", label: "Computer Science / Software Engineering" },
  { value: "engineering", label: "Engineering (Mechanical, Electrical, Civil)" },
  { value: "business", label: "Business / Finance / Economics" },
  { value: "health_premed", label: "Health Sciences / Pre-Med" },
  { value: "biology", label: "Biology / Life Sciences" },
  { value: "physical_sciences", label: "Physics / Chemistry / Math" },
  { value: "social_sciences", label: "Psychology / Sociology / Political Science" },
  { value: "humanities", label: "English / History / Philosophy" },
  { value: "arts", label: "Fine Arts / Music / Theater" },
  { value: "communications", label: "Communications / Journalism / Media" },
  { value: "education", label: "Education / Teaching" },
  { value: "undecided", label: "Undecided" },
];

const CAREER_GOALS = [
  { value: "", label: "Select a career path..." },
  { value: "tech_engineer", label: "Software Engineer / Tech" },
  { value: "tech_pm", label: "Product Manager / Tech Leadership" },
  { value: "finance", label: "Investment Banking / Finance" },
  { value: "consulting", label: "Management Consulting" },
  { value: "medicine", label: "Doctor / Physician (General)" },
  { value: "surgery", label: "Surgeon (General Surgery)" },
  { value: "neurosurgery", label: "Neurosurgeon / Brain Surgeon" },
  { value: "healthcare", label: "Healthcare (Non-MD)" },
  { value: "law", label: "Lawyer / Attorney" },
  { value: "academia", label: "Professor / Research" },
  { value: "teaching", label: "K-12 Teacher" },
  { value: "creative", label: "Creative / Design / Arts" },
  { value: "entrepreneur", label: "Start a Business" },
  { value: "government", label: "Government / Public Service" },
  { value: "not_sure", label: "Not sure yet" },
];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

// ============ HELPERS ============

function formatCurrency(value: number | null): string {
  if (value === null || isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(0)}%`;
}

function getNetPriceForIncome(college: CollegeData, incomeBracket: string): number | null {
  const byIncome = college.cost.netPriceByIncome?.[incomeBracket];
  return byIncome ?? college.cost.avgNetPrice;
}

// Calculate monthly loan payment (10-year standard repayment)
function calculateMonthlyPayment(principal: number, annualRate: number = 0.075, years: number = 10): number {
  if (principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
  return Math.round(payment);
}

// Calculate total interest paid over loan term
function calculateTotalInterest(principal: number, annualRate: number = 0.075, years: number = 10): number {
  const monthlyPayment = calculateMonthlyPayment(principal, annualRate, years);
  return (monthlyPayment * years * 12) - principal;
}

// ============ MAIN COMPONENT ============

export default function CollegePickerPage() {
  // Dark mode
  const [isDark, setIsDark] = useDarkMode();

  // Mode: chat or guided
  const [mode, setMode] = useState<AppMode>("chat");

  // Chat tab: "chat" or "analysis"
  const [chatTab, setChatTab] = useState<"chat" | "analysis">("chat");

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Chat sessions (for sidebar)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Guide sessions (for sidebar in Guide Me mode)
  const [guideSessions, setGuideSessions] = useState<GuideSession[]>([]);
  const [currentGuideSessionId, setCurrentGuideSessionId] = useState<string | null>(null);
  const [guideSidebarOpen, setGuideSidebarOpen] = useState(false);

  // Load chat sessions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("college-picker-sessions");
    if (saved) {
      try {
        const sessions: ChatSession[] = JSON.parse(saved);
        setChatSessions(sessions.sort((a, b) => b.updatedAt - a.updatedAt));
      } catch (e) {
        console.error("Failed to load chat sessions:", e);
      }
    }
  }, []);

  // Save chat sessions to localStorage when they change
  useEffect(() => {
    if (chatSessions.length > 0) {
      localStorage.setItem("college-picker-sessions", JSON.stringify(chatSessions));
    }
  }, [chatSessions]);

  // Load guide sessions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("college-picker-guide-sessions");
    if (saved) {
      try {
        const sessions: GuideSession[] = JSON.parse(saved);
        setGuideSessions(sessions.sort((a, b) => b.updatedAt - a.updatedAt));
      } catch (e) {
        console.error("Failed to load guide sessions:", e);
      }
    }
  }, []);

  // Save guide sessions to localStorage when they change
  useEffect(() => {
    if (guideSessions.length > 0) {
      localStorage.setItem("college-picker-guide-sessions", JSON.stringify(guideSessions));
    }
  }, [guideSessions]);

  // Save current conversation to session
  useEffect(() => {
    if (chatMessages.length === 0) return;

    const now = Date.now();
    if (currentSessionId) {
      // Update existing session
      setChatSessions(prev => prev.map(s =>
        s.id === currentSessionId
          ? { ...s, messages: chatMessages, updatedAt: now }
          : s
      ));
    } else {
      // Create new session
      const firstUserMsg = chatMessages.find(m => m.role === "user");
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? "..." : "")
        : "New conversation";
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        title,
        messages: chatMessages,
        createdAt: now,
        updatedAt: now,
      };
      setCurrentSessionId(newSession.id);
      setChatSessions(prev => [newSession, ...prev]);
    }
  }, [chatMessages, currentSessionId]);

  // Start new chat
  const startNewChat = () => {
    setChatMessages([]);
    setCurrentSessionId(null);
    setChatInput("");
  };

  // Load a session
  const loadSession = (session: ChatSession) => {
    setChatMessages(session.messages);
    setCurrentSessionId(session.id);
  };

  // Delete a session
  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      startNewChat();
    }
    // Update localStorage
    const remaining = chatSessions.filter(s => s.id !== sessionId);
    if (remaining.length === 0) {
      localStorage.removeItem("college-picker-sessions");
    }
  };

  // Guide session functions
  const startNewGuide = () => {
    setSelectedColleges([]);
    setLifePaths([]);
    setAnalysisResult(null);
    setCurrentGuideSessionId(null);
    setStep("intake");
  };

  const loadGuideSession = (session: GuideSession) => {
    setSelectedColleges(session.colleges);
    setProfile(session.profile);
    setLifePaths(session.lifePaths);
    setAnalysisResult(session.analysis);
    setCurrentGuideSessionId(session.id);
    setStep("compare");
  };

  const deleteGuideSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setGuideSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentGuideSessionId === sessionId) {
      startNewGuide();
    }
    const remaining = guideSessions.filter(s => s.id !== sessionId);
    if (remaining.length === 0) {
      localStorage.removeItem("college-picker-guide-sessions");
    }
  };

  const saveGuideSession = (colleges: CollegeData[], paths: LifePath[], analysis: AnalysisResult | null) => {
    const now = Date.now();
    const title = colleges.map(c => c.name.split(" ")[0]).join(" vs ");

    if (currentGuideSessionId) {
      // Update existing session
      setGuideSessions(prev => prev.map(s =>
        s.id === currentGuideSessionId
          ? { ...s, colleges, profile, lifePaths: paths, analysis, updatedAt: now }
          : s
      ));
    } else {
      // Create new session
      const newSession: GuideSession = {
        id: `guide-${now}`,
        title,
        colleges,
        profile,
        lifePaths: paths,
        analysis,
        createdAt: now,
        updatedAt: now,
      };
      setGuideSessions(prev => [newSession, ...prev]);
      setCurrentGuideSessionId(newSession.id);
    }
  };

  // Onboarding state (for guided mode)
  const [step, setStep] = useState<"intake" | "search" | "compare">("intake");
  const [profile, setProfile] = useState<StudentProfile>({
    incomeBracket: "48001-75000",
    homeState: "",
    intendedMajor: "",
    careerGoal: "",
    priorities: [],
    hasScholarships: false,
    scholarshipAmount: 0,
    currentAge: 18,
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CollegeData[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Comparison state
  const [selectedColleges, setSelectedColleges] = useState<CollegeData[]>([]);
  const [lifePaths, setLifePaths] = useState<LifePath[]>([]);
  const [pathsLoading, setPathsLoading] = useState(false);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Cost display toggle
  const [includeRoomBoard, setIncludeRoomBoard] = useState(true);

  // Fast autocomplete
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const debounceTimer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const response = await fetch(`/api/colleges/autocomplete?q=${encodeURIComponent(searchQuery)}&limit=8`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (data.results) {
          const mapped = data.results.map((r: {
            id: number;
            name: string;
            city: string;
            state: string;
            ownership: string;
            avgNetPrice: number | null;
            graduationRate6yr: number | null;
            acceptanceRate: number | null;
            tuitionInState: number | null;
            tuitionOutOfState: number | null;
            roomBoardOnCampus: number | null;
            roomBoardOffCampus: number | null;
            books: number | null;
          }) => ({
            id: r.id,
            name: r.name,
            city: r.city,
            state: r.state,
            ownership: r.ownership,
            cost: {
              avgNetPrice: r.avgNetPrice,
              tuitionInState: r.tuitionInState,
              tuitionOutOfState: r.tuitionOutOfState,
              roomBoardOnCampus: r.roomBoardOnCampus,
              roomBoardOffCampus: r.roomBoardOffCampus,
              books: r.books,
              costAttendance: null,
              netPriceByIncome: {}
            },
            outcomes: { graduationRate6yr: r.graduationRate6yr },
            admissions: { acceptanceRate: r.acceptanceRate },
          }));
          setSuggestions(mapped);
          setShowSuggestions(true);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Autocomplete error:", err);
        }
      } finally {
        setLoadingSuggestions(false);
      }
    }, 50);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [searchQuery, profile.homeState]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (college: CollegeData) => {
    setSearchQuery("");
    setShowSuggestions(false);
    setSuggestions([]);
    // Use the data we already have from autocomplete
    addToComparison(college);
  };

  const addToComparison = (college: CollegeData) => {
    if (selectedColleges.length >= 4) {
      alert("You can compare up to 4 colleges at a time");
      return;
    }
    if (selectedColleges.find((c) => c.id === college.id)) return;
    setSelectedColleges([...selectedColleges, college]);
    setLifePaths([]);
    setAnalysisResult(null);
  };

  const removeFromComparison = (collegeId: number) => {
    setSelectedColleges(selectedColleges.filter((c) => c.id !== collegeId));
    setLifePaths([]);
    setAnalysisResult(null);
  };

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-generate life paths and analysis when arriving at compare page
  useEffect(() => {
    if (step === "search" && selectedColleges.length > 0 && lifePaths.length === 0 && !pathsLoading) {
      generateLifePaths();
      // Also run AI analysis if comparing 2+ colleges
      if (selectedColleges.length >= 2 && !analysisResult && !analysisLoading) {
        generateAnalysis();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedColleges.length]);

  // Send chat message
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setChatLoading(true);

    try {
      const response = await fetch("/api/colleges/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: chatMessages,
        }),
      });

      const data = await response.json();
      if (data.message) {
        setChatMessages((prev) => [...prev, {
          role: "assistant",
          content: data.message,
          collegeData: data.collegeData || [],
        }]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const generateLifePaths = async () => {
    if (selectedColleges.length === 0) return;

    setPathsLoading(true);
    try {
      const response = await fetch("/api/colleges/life-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colleges: selectedColleges,
          profile,
        }),
      });
      const data = await response.json();
      if (data.paths) {
        setLifePaths(data.paths);
        // Save guide session
        saveGuideSession(selectedColleges, data.paths, analysisResult);
      }
    } catch (err) {
      console.error("Life path error:", err);
    } finally {
      setPathsLoading(false);
    }
  };

  const generateAnalysis = async () => {
    if (selectedColleges.length < 2) return;

    setAnalysisLoading(true);
    try {
      const response = await fetch("/api/colleges/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colleges: selectedColleges.map((c) => ({
            id: c.id,
            name: c.name,
            city: c.city,
            state: c.state,
            ownership: c.ownership,
            size: c.size,
            admissions: c.admissions,
            cost: c.cost,
            outcomes: c.outcomes,
            debt: c.debt,
            earnings: c.earnings,
          })),
          incomeBracket: profile.incomeBracket,
          userContext: `Interested in ${MAJOR_CATEGORIES.find(m => m.value === profile.intendedMajor)?.label || 'undecided major'}, career goal: ${CAREER_GOALS.find(c => c.value === profile.careerGoal)?.label || 'undecided'}`,
        }),
      });
      const data = await response.json();
      if (data.analysis) {
        setAnalysisResult(data.analysis);
        // Update guide session with analysis
        if (lifePaths.length > 0) {
          saveGuideSession(selectedColleges, lifePaths, data.analysis);
        }
      }
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const startOver = () => {
    setStep("intake");
    setSelectedColleges([]);
    setLifePaths([]);
    setAnalysisResult(null);
    setSearchQuery("");
    setCurrentGuideSessionId(null);
  };

  const isProfileComplete = profile.intendedMajor && profile.careerGoal && profile.homeState;

  // ============ RENDER: CHAT MODE ============
  if (mode === "chat") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-[#1c1917] dark:to-[#1c1917] flex">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? "w-64" : "w-0"} flex-shrink-0 bg-white dark:bg-[#1c1917] border-r border-gray-200 dark:border-[#292524] transition-all duration-300 overflow-hidden`}>
          <div className="w-64 h-screen flex flex-col">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-200 dark:border-[#292524]">
              <button
                onClick={startNewChat}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Chat
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto py-2">
              {chatSessions.length === 0 ? (
                <p className="px-4 py-8 text-sm text-gray-500 dark:text-stone-500 text-center">
                  No conversations yet
                </p>
              ) : (
                <div className="space-y-1 px-2">
                  {chatSessions.map(session => (
                    <div
                      key={session.id}
                      onClick={() => loadSession(session)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && loadSession(session)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors group cursor-pointer ${
                        currentSessionId === session.id
                          ? "bg-indigo-50 dark:bg-[#292524] text-indigo-700 dark:text-indigo-400"
                          : "text-gray-700 dark:text-stone-300 hover:bg-gray-100 dark:hover:bg-[#292524]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate flex-1">{session.title}</span>
                        <button
                          onClick={(e) => deleteSession(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-[#44403c] rounded transition-all"
                          title="Delete conversation"
                        >
                          <svg className="w-4 h-4 text-gray-500 dark:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-stone-500">
                        {new Date(session.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white dark:bg-[#292524] border-b border-gray-200 dark:border-[#3a3836] shadow-sm">
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Sidebar Toggle */}
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#44403c] transition-colors"
                  title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <h1 className="text-xl font-bold text-black dark:text-stone-100">College Picker</h1>
              </div>

              {/* Dark Mode Toggle */}
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#44403c] transition-colors"
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? (
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
            </div>
          </header>

          <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4">
          {/* Chat/Analysis Tabs - only show when there's analysis data */}
          {(selectedColleges.length > 0 || lifePaths.length > 0 || analysisResult) && (
            <div className="flex justify-center pt-4">
              <div className="flex items-center bg-gray-100 dark:bg-[#292524] rounded-lg p-1">
                <button
                  onClick={() => setChatTab("chat")}
                  className={`px-5 py-2 text-sm font-medium rounded-md transition-all ${
                    chatTab === "chat"
                      ? "bg-white dark:bg-[#44403c] text-gray-900 dark:text-stone-100 shadow-sm"
                      : "text-gray-600 dark:text-stone-400 hover:text-gray-900 dark:hover:text-stone-100"
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setChatTab("analysis")}
                  className={`px-5 py-2 text-sm font-medium rounded-md transition-all ${
                    chatTab === "analysis"
                      ? "bg-white dark:bg-[#44403c] text-gray-900 dark:text-stone-100 shadow-sm"
                      : "text-gray-600 dark:text-stone-400 hover:text-gray-900 dark:hover:text-stone-100"
                  }`}
                >
                  Analysis
                  {selectedColleges.length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">
                      {selectedColleges.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Analysis Tab View */}
          {chatTab === "analysis" && (selectedColleges.length > 0 || lifePaths.length > 0) ? (
            <div className="flex-1 overflow-y-auto py-6">
              {/* College chips and profile summary */}
              <div className="bg-white dark:bg-[#292524] rounded-lg shadow-md p-4 mb-6 border border-gray-200 dark:border-[#44403c]">
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedColleges.map((college) => (
                    <div
                      key={college.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-full text-sm"
                    >
                      <span className="font-medium">{college.name}</span>
                      <button
                        onClick={() => removeFromComparison(college.id)}
                        className="hover:text-indigo-600 dark:hover:text-indigo-200"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="text-sm text-gray-600 dark:text-stone-400 space-y-1">
                  {(profile.intendedMajor || profile.careerGoal) && (
                    <p>
                      Studying <span className="font-medium text-gray-900 dark:text-stone-200">{profile.intendedMajor || "undecided"}</span>
                      {profile.careerGoal && <> → <span className="font-medium text-gray-900 dark:text-stone-200">{profile.careerGoal}</span></>}
                    </p>
                  )}
                  <p>
                    Family income: <span className="font-medium text-gray-900 dark:text-stone-200">{INCOME_BRACKETS.find(b => b.value === profile.incomeBracket)?.label || profile.incomeBracket}</span>
                    {profile.homeState && <> • Home state: <span className="font-medium text-gray-900 dark:text-stone-200">{profile.homeState}</span></>}
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={generateLifePaths}
                    disabled={pathsLoading || selectedColleges.length === 0}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {pathsLoading ? "Loading..." : lifePaths.length > 0 ? "Refresh Analysis" : "Generate Analysis"}
                  </button>
                </div>
              </div>

              {/* Quick Comparison Table */}
              {selectedColleges.length > 0 && (
                <div className="bg-white dark:bg-[#292524] rounded-lg shadow-md p-6 mb-6 border border-gray-200 dark:border-[#44403c]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-black dark:text-stone-100">Quick Comparison</h2>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-sm text-gray-600 dark:text-stone-400">Include room & board</span>
                      <button
                        onClick={() => setIncludeRoomBoard(!includeRoomBoard)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${includeRoomBoard ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${includeRoomBoard ? 'translate-x-5' : ''}`} />
                      </button>
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-gray-200 dark:border-[#44403c]">
                          <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">School</th>
                          <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">
                            <div>Retail Price/yr</div>
                            <div className="text-xs font-normal">{includeRoomBoard ? "(tuition + room & board)" : "(tuition only)"}</div>
                          </th>
                          <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">
                            <div>Your Price/yr *</div>
                            <div className="text-xs font-normal">(based on income)</div>
                          </th>
                          <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">4-Year Cost</th>
                          <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">Grad Rate</th>
                          <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">Acceptance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedColleges.map((college) => {
                          const isInState = college.state === profile.homeState;
                          const tuition = isInState ? college.cost.tuitionInState : college.cost.tuitionOutOfState;
                          const retailPerYear = includeRoomBoard
                            ? (tuition || 0) + (college.cost.roomBoardOnCampus || 0)
                            : tuition;
                          const yourPricePerYear = college.cost.netPriceByIncome?.[profile.incomeBracket] ?? college.cost.avgNetPrice;
                          return (
                            <tr key={college.id} className="border-b border-gray-100 dark:border-[#44403c]">
                              <td className="py-3 px-4">
                                <div className="font-bold text-black dark:text-stone-100">{college.name}</div>
                                <div className="text-sm text-gray-500 dark:text-stone-500">{college.city}, {college.state}</div>
                              </td>
                              <td className="py-3 px-4 font-semibold text-black dark:text-stone-100">
                                {formatCurrency(retailPerYear)}
                              </td>
                              <td className="py-3 px-4 font-semibold text-blue-600 dark:text-blue-400">
                                {yourPricePerYear && retailPerYear && yourPricePerYear <= retailPerYear
                                  ? formatCurrency(yourPricePerYear)
                                  : "—"}
                              </td>
                              <td className="py-3 px-4 font-bold text-black dark:text-stone-100">
                                {formatCurrency(retailPerYear ? retailPerYear * 4 : null)}
                              </td>
                              <td className="py-3 px-4 text-black dark:text-stone-100">
                                {formatPercent(college.outcomes?.graduationRate6yr)}
                              </td>
                              <td className="py-3 px-4 text-black dark:text-stone-100">
                                {formatPercent(college.admissions?.acceptanceRate)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-stone-500 mt-3">* Average paid by families in your income bracket who filed for federal aid. Families paying full price without FAFSA aren&apos;t included.</p>
                </div>
              )}

              {/* Life Paths */}
              {lifePaths.length > 0 && (() => {
                const lowestDebtId = lifePaths.length > 1
                  ? lifePaths.reduce((min, p) => p.summary.peakDebt < min.summary.peakDebt ? p : min).college.id
                  : null;
                return (
                <div className="bg-white dark:bg-[#292524] rounded-lg shadow-md p-6 mb-6 border border-gray-200 dark:border-[#44403c]">
                  <h2 className="text-lg font-bold text-black dark:text-stone-100 mb-4">Your Life Paths</h2>
                  <div className="space-y-6">
                    {lifePaths.map((path) => (
                      <div key={path.college.id} className="border-2 border-gray-200 dark:border-[#44403c] rounded-xl p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold text-black dark:text-stone-100">{path.college.name}</h3>
                              {lowestDebtId === path.college.id && (
                                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-bold rounded-full">
                                  💰 Lowest Debt
                                </span>
                              )}
                            </div>
                            {path.occupation ? (
                              <div className="mt-1">
                                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                  {path.occupation.title}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-stone-400">
                                  {formatCurrency(path.occupation.salaryRange.low)} - {formatCurrency(path.occupation.salaryRange.high)}/yr
                                  <span className="ml-2 text-xs text-gray-500 dark:text-stone-500">
                                    ({path.occupation.location})
                                  </span>
                                </p>
                                {path.occupation.growthRate > 0 && (
                                  <p className="text-xs text-green-600 dark:text-green-400">
                                    +{path.occupation.growthRate}% job growth projected
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-600 dark:text-stone-400">
                                Expected earnings: {formatCurrency(path.majorEarnings)}/yr
                              </p>
                            )}
                          </div>
                          <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                            path.summary.netWorthAt35 > 200000 ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" :
                            path.summary.netWorthAt35 > 50000 ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" :
                            path.summary.netWorthAt35 > 0 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300" :
                            "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                          }`}>
                            Net worth at 35: {formatCurrency(path.summary.netWorthAt35)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="bg-gray-50 dark:bg-[#1c1917] rounded-lg p-3">
                            <div className="text-xs text-gray-500 dark:text-stone-500">Total Cost</div>
                            <div className="text-lg font-bold text-black dark:text-stone-100">{formatCurrency(path.summary.totalCost)}</div>
                            <div className="mt-2 space-y-1">
                              {path.summary.costBreakdown.aidAdjustedUndergrad &&
                               path.summary.costBreakdown.aidAdjustedUndergrad <= path.summary.costBreakdown.undergradWithRoomBoard && (
                                <div className="text-sm font-semibold text-green-700 dark:text-green-400">You pay: {formatCurrency(path.summary.costBreakdown.aidAdjustedUndergrad)}</div>
                              )}
                              <div className="text-xs text-gray-400 dark:text-stone-500">Retail: {formatCurrency(path.summary.costBreakdown.undergradWithRoomBoard)}</div>
                              <div className="text-xs text-gray-300 dark:text-stone-600">Tuition only: {formatCurrency(path.summary.costBreakdown.undergradTuitionOnly)}</div>
                              {path.summary.costBreakdown.gradSchoolCost > 0 && (
                                <div className="text-xs text-gray-400 dark:text-stone-500 pt-1">+ Grad school: {formatCurrency(path.summary.costBreakdown.gradSchoolCost)}</div>
                              )}
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-[#1c1917] rounded-lg p-3">
                            <div className="text-xs text-gray-500 dark:text-stone-500">Peak Debt</div>
                            <div className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(path.summary.peakDebt)}</div>
                          </div>
                          <div className="bg-gray-50 dark:bg-[#1c1917] rounded-lg p-3">
                            <div className="text-xs text-gray-500 dark:text-stone-500">Loan Payment</div>
                            <div className="text-lg font-bold text-red-600 dark:text-red-400">
                              {path.summary.peakDebt > 0 ? `${formatCurrency(calculateMonthlyPayment(path.summary.peakDebt))}/mo` : "—"}
                            </div>
                            {path.summary.peakDebt > 0 && (
                              <div className="text-[10px] text-gray-400 dark:text-stone-500">10yr @ 7.5% on peak debt</div>
                            )}
                          </div>
                          <div className="bg-gray-50 dark:bg-[#1c1917] rounded-lg p-3">
                            <div className="text-xs text-gray-500 dark:text-stone-500">Total Interest</div>
                            <div className="text-lg font-bold text-red-600 dark:text-red-400">
                              {path.summary.peakDebt > 0 ? formatCurrency(calculateTotalInterest(path.summary.peakDebt)) : "—"}
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-[#1c1917] rounded-lg p-3">
                            <div className="text-xs text-gray-500 dark:text-stone-500">Break Even</div>
                            <div className="text-lg font-bold text-black dark:text-stone-100">
                              {path.summary.breakEvenAge ? `Age ${path.summary.breakEvenAge}` : "35+"}
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-[#1c1917] rounded-lg p-3">
                            <div className="text-xs text-gray-500 dark:text-stone-500">Net Worth at 35</div>
                            <div className={`text-lg font-bold ${path.summary.netWorthAt35 >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {formatCurrency(path.summary.netWorthAt35)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );})()}

              {/* AI Analysis */}
              {analysisResult && (
                <div className="bg-white dark:bg-[#292524] rounded-lg shadow-md p-6 mb-6 border border-gray-200 dark:border-[#44403c]">
                  <h2 className="text-lg font-bold text-black dark:text-stone-100 mb-4">AI Analysis</h2>
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
                    <p className="text-purple-900 dark:text-purple-200">{analysisResult.summary}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {analysisResult.colleges.map((analysis) => (
                      <div key={analysis.id} className="border-2 border-gray-200 dark:border-[#44403c] rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-black dark:text-stone-100">{analysis.name}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            analysis.verdict === "Excellent" ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" :
                            analysis.verdict === "Good" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" :
                            analysis.verdict === "Fair" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300" :
                            "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                          }`}>
                            {analysis.verdict}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-stone-300 mb-2">
                          <span className="text-green-700 dark:text-green-400 font-medium">✓</span> {analysis.whyChoose[0]}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-stone-300">
                          <span className="text-red-700 dark:text-red-400 font-medium">✗</span> {analysis.whyNot[0]}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-blue-900 dark:text-blue-200"><span className="font-bold">Recommendation:</span> {analysisResult.recommendation}</p>
                  </div>
                </div>
              )}

              {/* Empty state for analysis tab */}
              {selectedColleges.length === 0 && lifePaths.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-stone-400 mb-4">No colleges selected yet.</p>
                  <button
                    onClick={() => setMode("guided")}
                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
                  >
                    Go to Guide Me
                  </button>
                </div>
              )}
            </div>
          ) : chatMessages.length === 0 ? (
            /* Empty state - positioned higher like Claude */
            <div className="flex-1 flex flex-col items-center pt-[15vh]">
              {/* Mode Toggle */}
              <div className="flex items-center justify-center mb-8">
                <div className="flex items-center bg-gray-100 dark:bg-[#292524] rounded-lg p-1">
                  <button
                    onClick={() => setMode("chat")}
                    className="px-5 py-2 text-sm font-medium rounded-md transition-all bg-white dark:bg-[#44403c] text-gray-900 dark:text-stone-100 shadow-sm"
                  >
                    Ask Anything
                  </button>
                  <button
                    onClick={() => setMode("guided")}
                    className="px-5 py-2 text-sm font-medium rounded-md transition-all text-gray-600 dark:text-stone-400 hover:text-gray-900 dark:hover:text-stone-100"
                  >
                    Guide Me
                  </button>
                </div>
              </div>

              <h2 className="text-3xl font-bold text-gray-900 dark:text-stone-100 mb-3 text-center">
                Is your college choice worth it?
              </h2>
              <p className="text-gray-600 dark:text-stone-400 mb-8 max-w-lg mx-auto text-lg text-center">
                Tell me what colleges you&apos;re considering and what you want to study.
                I&apos;ll show you the real costs, potential debt, and what happens if things
                don&apos;t go according to plan.
              </p>

              {/* Centered Input */}
              <div className="w-full max-w-2xl">
                <div className="bg-white dark:bg-[#292524] rounded-xl shadow-lg border border-gray-100 dark:border-[#44403c] p-4">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    placeholder="Tell me about the colleges you're considering..."
                    className="w-full resize-none border-0 focus:ring-0 bg-transparent text-gray-900 dark:text-stone-100 placeholder-gray-500 dark:placeholder-stone-500 text-base"
                    rows={3}
                  />
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100 dark:border-[#44403c]">
                    <p className="text-xs text-gray-500 dark:text-stone-500">
                      Press Enter to send, Shift+Enter for new line
                    </p>
                    <button
                      onClick={sendChatMessage}
                      disabled={chatLoading || !chatInput.trim()}
                      className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {chatLoading ? "Thinking..." : "Send"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Suggestions below input */}
              <div className="mt-6 w-full max-w-2xl">
                <p className="text-sm font-medium text-gray-500 dark:text-stone-400 mb-3 text-center">Try asking:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => setChatInput("I want to go to UCLA for pre-med. Is it worth the cost?")}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-stone-400 bg-white dark:bg-[#292524] border border-gray-200 dark:border-[#44403c] rounded-full hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    UCLA for pre-med worth it?
                  </button>
                  <button
                    onClick={() => setChatInput("Should I go to community college first then transfer to save money?")}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-stone-400 bg-white dark:bg-[#292524] border border-gray-200 dark:border-[#44403c] rounded-full hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    Community college then transfer?
                  </button>
                  <button
                    onClick={() => setChatInput("I'm thinking about getting a business degree from ASU. What if I can't find a job in my field?")}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-stone-400 bg-white dark:bg-[#292524] border border-gray-200 dark:border-[#44403c] rounded-full hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    What if I can&apos;t find a job?
                  </button>
                </div>
              </div>

              <p className="text-center text-xs text-gray-400 dark:text-stone-500 mt-8">
                College Picker AI can make mistakes. Please double-check responses.
              </p>
            </div>
          ) : (
            /* Active chat - messages with input at bottom */
            <>
              <div className="flex-1 overflow-y-auto py-6 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] ${
                        msg.role === "user"
                          ? "rounded-lg px-4 py-3 bg-indigo-600 text-white"
                          : ""
                      }`}
                    >
                      {msg.role === "user" ? (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {msg.content}
                        </div>
                      ) : (
                        <>
                          {/* Assistant message content */}
                          <div className="bg-white dark:bg-[#292524] border border-gray-200 dark:border-[#44403c] text-gray-900 dark:text-stone-100 rounded-lg px-4 py-3">
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:my-2 prose-headings:font-semibold">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          </div>

                          {/* Mini comparison card - show when 2+ colleges detected */}
                          {msg.collegeData && msg.collegeData.length >= 2 && (
                            <div className="mt-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-[#292524] dark:to-[#292524] border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">Quick Compare</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {msg.collegeData.slice(0, 4).map((college, idx) => (
                                  <div key={idx} className="bg-white dark:bg-[#1c1917] rounded-lg p-3 border border-gray-200 dark:border-[#44403c]">
                                    <div className="font-semibold text-gray-900 dark:text-stone-100 text-sm truncate">{college.name}</div>
                                    <div className="mt-2 space-y-1 text-xs">
                                      <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-stone-500">Debt:</span>
                                        <span className="font-medium text-gray-900 dark:text-stone-200">
                                          ${college.debt.medianDebt?.toLocaleString() || "N/A"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-stone-500">Salary (10yr):</span>
                                        <span className="font-medium text-gray-900 dark:text-stone-200">
                                          ${college.earnings.median10yr?.toLocaleString() || "N/A"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-stone-500">Grad Rate:</span>
                                        <span className="font-medium text-gray-900 dark:text-stone-200">
                                          {college.outcomes.graduationRate6yr ? `${(college.outcomes.graduationRate6yr * 100).toFixed(0)}%` : "N/A"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action buttons - show when colleges detected */}
                          {msg.collegeData && msg.collegeData.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => {
                                  // Toggle life path view for this message
                                  setChatMessages(prev => prev.map((m, idx) =>
                                    idx === i ? { ...m, showLifePath: !m.showLifePath } : m
                                  ));
                                }}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                  msg.showLifePath
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-white dark:bg-[#292524] text-gray-700 dark:text-stone-300 border-gray-300 dark:border-[#44403c] hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                }`}
                              >
                                {msg.showLifePath ? "Hide Life Path" : "Show Life Path"}
                              </button>
                              {msg.collegeData.length >= 2 && (
                                <button
                                  onClick={() => {
                                    setChatMessages(prev => prev.map((m, idx) =>
                                      idx === i ? { ...m, showAnalysis: !m.showAnalysis } : m
                                    ));
                                  }}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                    msg.showAnalysis
                                      ? "bg-purple-600 text-white border-purple-600"
                                      : "bg-white dark:bg-[#292524] text-gray-700 dark:text-stone-300 border-gray-300 dark:border-[#44403c] hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400"
                                  }`}
                                >
                                  {msg.showAnalysis ? "Hide AI Verdict" : "Get AI Verdict"}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  // Add detected colleges to comparison
                                  const newColleges = (msg.collegeData || [])
                                    .filter(c => c.id && !selectedColleges.some(sc => sc.id === c.id))
                                    .map(c => ({
                                      id: c.id!,
                                      name: c.name,
                                      city: c.city || "",
                                      state: c.state || "",
                                      website: null,
                                      ownership: (c.ownership || "unknown") as "public" | "private_nonprofit" | "private_forprofit",
                                      size: c.size || null,
                                      acceptanceRate: c.admissions?.acceptanceRate || null,
                                      admissions: {
                                        acceptanceRate: c.admissions?.acceptanceRate || null,
                                        satAverage: null,
                                        actAverage: null,
                                      },
                                      cost: {
                                        tuitionInState: c.cost.tuitionInState || null,
                                        tuitionOutOfState: null,
                                        roomBoardOnCampus: null,
                                        roomBoardOffCampus: null,
                                        books: null,
                                        costAttendance: null,
                                        avgNetPrice: c.cost.avgNetPrice,
                                        netPriceByIncome: {},
                                      },
                                      outcomes: {
                                        graduationRate4yr: null,
                                        graduationRate6yr: c.outcomes.graduationRate6yr,
                                        retentionRate: null,
                                      },
                                      debt: {
                                        medianDebt: c.debt.medianDebt,
                                        monthlyPayment: c.debt.monthlyPayment || null,
                                      },
                                      earnings: {
                                        median6yr: c.earnings.median6yr,
                                        median10yr: c.earnings.median10yr,
                                      },
                                    }));
                                  if (newColleges.length > 0) {
                                    setSelectedColleges(prev => [...prev, ...newColleges].slice(0, 4));
                                  }
                                }}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-white dark:bg-[#292524] text-gray-700 dark:text-stone-300 border-gray-300 dark:border-[#44403c] hover:border-green-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                              >
                                Add to Comparison
                              </button>
                            </div>
                          )}

                          {/* Expanded Life Path View */}
                          {msg.showLifePath && msg.collegeData && msg.collegeData.length > 0 && (
                            <div className="mt-4 bg-white dark:bg-[#292524] border border-gray-200 dark:border-[#44403c] rounded-lg p-4">
                              <h4 className="font-semibold text-gray-900 dark:text-stone-100 mb-3">10-Year Financial Projection</h4>
                              <div className="space-y-4">
                                {msg.collegeData.slice(0, 4).map((college, idx) => {
                                  const debt = college.debt.medianDebt || 0;
                                  const salary = college.earnings.median10yr || 55000;
                                  const monthlyPayment = Math.round(debt / 120);
                                  const yearsToPayoff = debt > 0 ? Math.ceil(debt / (salary * 0.1)) : 0;
                                  const netWorth10yr = Math.round((salary * 0.15 * 10) * 1.07 - debt * 0.3); // Rough estimate
                                  return (
                                    <div key={idx} className="border-b border-gray-100 dark:border-[#44403c] pb-3 last:border-0 last:pb-0">
                                      <div className="flex justify-between items-start mb-2">
                                        <span className="font-medium text-gray-900 dark:text-stone-100">{college.name}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                          yearsToPayoff <= 5 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                                          yearsToPayoff <= 10 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" :
                                          "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                        }`}>
                                          {yearsToPayoff > 0 ? `~${yearsToPayoff}yr payoff` : "No debt"}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div>
                                          <div className="text-gray-500 dark:text-stone-500">Starting Debt</div>
                                          <div className="font-semibold text-red-600 dark:text-red-400">${debt.toLocaleString()}</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-500 dark:text-stone-500">Loan Payment</div>
                                          <div className="font-semibold text-gray-900 dark:text-stone-200">${monthlyPayment}/mo</div>
                                          <div className="text-[9px] text-gray-400 dark:text-stone-500">10yr @ 7.5%</div>
                                        </div>
                                        <div>
                                          <div className="text-gray-500 dark:text-stone-500">Est. Net Worth (10yr)</div>
                                          <div className={`font-semibold ${netWorth10yr >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                            ${netWorth10yr.toLocaleString()}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Expanded AI Verdict View */}
                          {msg.showAnalysis && msg.collegeData && msg.collegeData.length >= 2 && (
                            <div className="mt-4 bg-white dark:bg-[#292524] border border-gray-200 dark:border-[#44403c] rounded-lg p-4">
                              <h4 className="font-semibold text-gray-900 dark:text-stone-100 mb-3">AI Quick Verdict</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {msg.collegeData.slice(0, 4).map((college, idx) => {
                                  const debt = college.debt.medianDebt || 0;
                                  const salary = college.earnings.median10yr || 55000;
                                  const roi = salary > 0 ? (salary - debt / 10) / salary : 0;
                                  const verdict = roi > 0.9 ? "Excellent" : roi > 0.7 ? "Good" : roi > 0.5 ? "Fair" : "Poor";
                                  return (
                                    <div key={idx} className="border border-gray-200 dark:border-[#44403c] rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-gray-900 dark:text-stone-100 text-sm truncate">{college.name}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                                          verdict === "Excellent" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                                          verdict === "Good" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                                          verdict === "Fair" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" :
                                          "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                        }`}>
                                          {verdict}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-600 dark:text-stone-400">
                                        {verdict === "Excellent" && "Strong ROI. Debt is manageable relative to expected earnings."}
                                        {verdict === "Good" && "Solid choice. You'll pay off debt reasonably fast."}
                                        {verdict === "Fair" && "Proceed with caution. Debt-to-income ratio is borderline."}
                                        {verdict === "Poor" && "High risk. Consider cheaper alternatives or different career path."}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-[#292524] border border-gray-200 dark:border-[#44403c] rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-stone-400">
                        <div className="w-2 h-2 bg-gray-400 dark:bg-stone-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 dark:bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                        <div className="w-2 h-2 bg-gray-400 dark:bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input at bottom */}
              <div className="py-4">
                <div className="bg-white dark:bg-[#292524] rounded-xl shadow-lg border border-gray-100 dark:border-[#44403c] p-4">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    placeholder="Ask a follow-up question..."
                    className="w-full resize-none border-0 focus:ring-0 bg-transparent text-gray-900 dark:text-stone-100 placeholder-gray-500 dark:placeholder-stone-500 text-base"
                    rows={2}
                  />
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100 dark:border-[#44403c]">
                    <p className="text-xs text-gray-500 dark:text-stone-500">
                      Press Enter to send
                    </p>
                    <button
                      onClick={sendChatMessage}
                      disabled={chatLoading || !chatInput.trim()}
                      className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {chatLoading ? "Thinking..." : "Send"}
                    </button>
                  </div>
                </div>
                <p className="text-center text-xs text-gray-400 dark:text-stone-500 mt-2">
                  College Picker AI can make mistakes. Please double-check responses.
                </p>
              </div>
            </>
          )}
          </main>
        </div>
      </div>
    );
  }

  // ============ RENDER: GUIDED MODE ============
  if (step === "intake") {
    const canSubmit = selectedColleges.length > 0 && profile.intendedMajor && profile.careerGoal && profile.homeState;
    const showNoResults = searchQuery.length >= 2 && !loadingSuggestions && suggestions.length === 0;

    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-[#1c1917] dark:to-[#1c1917] flex">
        {/* Guide Sidebar */}
        <aside className={`${guideSidebarOpen ? "w-64" : "w-0"} flex-shrink-0 bg-white dark:bg-[#1c1917] border-r border-gray-200 dark:border-[#292524] transition-all duration-300 overflow-hidden`}>
          <div className="w-64 h-screen flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-[#292524]">
              <button
                onClick={startNewGuide}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Comparison
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {guideSessions.length === 0 ? (
                <p className="px-4 py-8 text-sm text-gray-500 dark:text-stone-500 text-center">
                  No comparisons yet
                </p>
              ) : (
                <div className="space-y-1 px-2">
                  {guideSessions.map(session => (
                    <div
                      key={session.id}
                      onClick={() => loadGuideSession(session)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && loadGuideSession(session)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors group cursor-pointer ${
                        currentGuideSessionId === session.id
                          ? "bg-indigo-50 dark:bg-[#292524] text-indigo-700 dark:text-indigo-400"
                          : "text-gray-700 dark:text-stone-300 hover:bg-gray-100 dark:hover:bg-[#292524]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate flex-1">{session.title}</span>
                        <button
                          onClick={(e) => deleteGuideSession(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-[#44403c] rounded transition-all"
                          title="Delete comparison"
                        >
                          <svg className="w-4 h-4 text-gray-500 dark:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-stone-500">
                        {new Date(session.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-[#292524] border-b border-gray-200 dark:border-[#44403c] shadow-sm">
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setGuideSidebarOpen(!guideSidebarOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#44403c] transition-colors"
                title={guideSidebarOpen ? "Hide sidebar" : "Show sidebar"}
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-black dark:text-stone-100">College Picker</h1>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#44403c] transition-colors"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Mode Toggle */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center bg-gray-100 dark:bg-[#292524] rounded-lg p-1">
              <button
                onClick={() => setMode("chat")}
                className="px-5 py-2 text-sm font-medium rounded-md transition-all text-gray-600 dark:text-stone-400 hover:text-gray-900 dark:hover:text-stone-100"
              >
                Ask Anything
              </button>
              <button
                onClick={() => setMode("guided")}
                className="px-5 py-2 text-sm font-medium rounded-md transition-all bg-white dark:bg-[#44403c] text-gray-900 dark:text-stone-100 shadow-sm"
              >
                Guide Me
              </button>
            </div>
          </div>

          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-stone-100 mb-3">
                Compare colleges for <span className="text-indigo-600 dark:text-indigo-400">your</span> future
              </h2>
              <p className="text-gray-600 dark:text-stone-400 text-lg">
                Pick your schools, tell us your goals, and we&apos;ll show you the real costs and outcomes.
              </p>
            </div>

            <div className="bg-white dark:bg-[#292524] rounded-xl shadow-lg p-8 space-y-6 border border-gray-100 dark:border-[#44403c]">

              {/* 1. College Selection */}
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-stone-100 mb-2">
                  Which college(s) are you considering?
                </label>
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Type a college name (e.g., UCLA, Stanford, MIT)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-[#44403c] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black dark:text-stone-100 placeholder-gray-500 dark:placeholder-stone-500 bg-white dark:bg-[#1c1917]"
                  />
                  {loadingSuggestions && (
                    <div className="absolute right-3 top-3.5 text-gray-500 dark:text-stone-400 text-sm">Searching...</div>
                  )}

                  {showSuggestions && suggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 w-full mt-1 bg-white dark:bg-[#292524] border-2 border-gray-200 dark:border-[#44403c] rounded-lg shadow-lg max-h-60 overflow-y-auto"
                    >
                      {suggestions.map((college) => (
                        <button
                          key={college.id}
                          onClick={() => selectSuggestion(college)}
                          className="w-full px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-[#44403c] border-b border-gray-100 dark:border-[#44403c] last:border-b-0"
                        >
                          <div className="font-semibold text-black dark:text-stone-100">{college.name}</div>
                          <div className="text-sm text-gray-600 dark:text-stone-400">
                            {college.city}, {college.state} • {formatCurrency(college.cost.avgNetPrice)}/yr avg
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {showNoResults && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#292524] border-2 border-gray-200 dark:border-[#44403c] rounded-lg shadow-lg p-4">
                      <p className="text-gray-600 dark:text-stone-400 text-sm">
                        We couldn&apos;t find &quot;{searchQuery}&quot; in our database. Try a different spelling, or use{" "}
                        <button onClick={() => setMode("chat")} className="text-indigo-600 dark:text-indigo-400 underline">
                          Ask Anything
                        </button>{" "}
                        mode for general advice.
                      </p>
                    </div>
                  )}
                </div>

                {/* Selected colleges chips */}
                {selectedColleges.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedColleges.map((college) => (
                      <div
                        key={college.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-full text-sm"
                      >
                        <span className="font-medium">{college.name}</span>
                        <button
                          onClick={() => removeFromComparison(college.id)}
                          className="hover:text-indigo-600 dark:hover:text-indigo-200"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-sm text-gray-500 dark:text-stone-500 mt-2">Select 1-3 schools to compare</p>
              </div>

              {/* 2. What do you want to study? (freeform) */}
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-stone-100 mb-2">
                  What do you want to study?
                </label>
                <input
                  type="text"
                  placeholder="e.g., Computer Science, Nursing, Business, Pre-Med..."
                  value={profile.intendedMajor}
                  onChange={(e) => setProfile({ ...profile, intendedMajor: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-[#44403c] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black dark:text-stone-100 placeholder-gray-500 dark:placeholder-stone-500 bg-white dark:bg-[#1c1917]"
                />
              </div>

              {/* 3. Career goal (freeform) */}
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-stone-100 mb-2">
                  What career are you aiming for?
                </label>
                <input
                  type="text"
                  placeholder="e.g., Software Engineer, Nurse, Marketing Manager..."
                  value={profile.careerGoal}
                  onChange={(e) => setProfile({ ...profile, careerGoal: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-[#44403c] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black dark:text-stone-100 placeholder-gray-500 dark:placeholder-stone-500 bg-white dark:bg-[#1c1917]"
                />
              </div>

              {/* 4. State + Income + Age row */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-stone-100 mb-2">
                    Your state
                  </label>
                  <select
                    value={profile.homeState}
                    onChange={(e) => setProfile({ ...profile, homeState: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-[#44403c] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black dark:text-stone-100 bg-white dark:bg-[#1c1917]"
                  >
                    <option value="">Select...</option>
                    {US_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-stone-100 mb-2">
                    Family income
                  </label>
                  <select
                    value={profile.incomeBracket}
                    onChange={(e) => setProfile({ ...profile, incomeBracket: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-[#44403c] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black dark:text-stone-100 bg-white dark:bg-[#1c1917]"
                  >
                    {INCOME_BRACKETS.map((bracket) => (
                      <option key={bracket.value} value={bracket.value}>{bracket.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-stone-100 mb-2">
                    Current age
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={profile.currentAge}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      const num = parseInt(val) || 0;
                      if (num <= 99) {
                        setProfile({ ...profile, currentAge: num || 18 });
                      }
                    }}
                    onBlur={(e) => {
                      const num = parseInt(e.target.value) || 18;
                      setProfile({ ...profile, currentAge: Math.max(14, Math.min(99, num)) });
                    }}
                    placeholder="18"
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-[#44403c] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black dark:text-stone-100 bg-white dark:bg-[#1c1917]"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={() => setStep("search")}
                disabled={!canSubmit}
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-lg transition-colors"
              >
                {selectedColleges.length === 0
                  ? "Select at least one college"
                  : selectedColleges.length === 1
                    ? `Analyze ${selectedColleges[0].name} →`
                    : `Compare ${selectedColleges.length} Colleges →`
                }
              </button>
            </div>
          </div>
        </div>
        </main>
        </div>
      </div>
    );
  }

  // ============ RENDER: SEARCH & COMPARE ============
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#1c1917] flex">
      {/* Guide Sidebar */}
      <aside className={`${guideSidebarOpen ? "w-64" : "w-0"} flex-shrink-0 bg-white dark:bg-[#1c1917] border-r border-gray-200 dark:border-[#292524] transition-all duration-300 overflow-hidden`}>
        <div className="w-64 h-screen flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-[#292524]">
            <button
              onClick={startNewGuide}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Comparison
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {guideSessions.length === 0 ? (
              <p className="px-4 py-8 text-sm text-gray-500 dark:text-stone-500 text-center">
                No comparisons yet
              </p>
            ) : (
              <div className="space-y-1 px-2">
                {guideSessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => loadGuideSession(session)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && loadGuideSession(session)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors group cursor-pointer ${
                      currentGuideSessionId === session.id
                        ? "bg-indigo-50 dark:bg-[#292524] text-indigo-700 dark:text-indigo-400"
                        : "text-gray-700 dark:text-stone-300 hover:bg-gray-100 dark:hover:bg-[#292524]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate flex-1">{session.title}</span>
                      <button
                        onClick={(e) => deleteGuideSession(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-[#44403c] rounded transition-all"
                        title="Delete comparison"
                      >
                        <svg className="w-4 h-4 text-gray-500 dark:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-stone-500">
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
      <header className="bg-white dark:bg-[#292524] border-b border-gray-300 dark:border-[#44403c] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setGuideSidebarOpen(!guideSidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#44403c] transition-colors"
              title={guideSidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button onClick={startOver} className="text-gray-700 dark:text-stone-400 hover:text-black dark:hover:text-stone-100 font-medium">
              ← Start Over
            </button>
            <h1 className="text-xl font-bold text-black dark:text-stone-100">College Picker</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Mode Toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-[#1c1917] rounded-lg p-1">
              <button
                onClick={() => setMode("chat")}
                className="px-4 py-1.5 text-sm font-medium rounded-md transition-all text-gray-600 dark:text-stone-400 hover:text-gray-900 dark:hover:text-stone-100"
              >
                Ask Anything
              </button>
              <button
                className="px-4 py-1.5 text-sm font-medium rounded-md transition-all bg-white dark:bg-[#44403c] text-gray-900 dark:text-stone-100 shadow-sm"
              >
                Guide Me
              </button>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#44403c] transition-colors"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Profile summary bar */}
        <div className="max-w-7xl mx-auto px-4 pb-3">
          <div className="text-sm text-gray-600 dark:text-stone-400">
            Studying <span className="font-medium text-gray-900 dark:text-stone-200">{profile.intendedMajor || "undecided"}</span>
            {" → "}
            <span className="font-medium text-gray-900 dark:text-stone-200">{profile.careerGoal || "exploring careers"}</span>
            <span className="mx-2">•</span>
            Income: <span className="font-medium text-gray-900 dark:text-stone-200">{INCOME_BRACKETS.find(b => b.value === profile.incomeBracket)?.label || profile.incomeBracket}</span>
            {profile.homeState && (
              <>
                <span className="mx-2">•</span>
                Home: <span className="font-medium text-gray-900 dark:text-stone-200">{profile.homeState}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="bg-white dark:bg-[#292524] rounded-lg shadow-md p-6 mb-6 border border-gray-200 dark:border-[#44403c]">
          <h2 className="text-lg font-bold text-black dark:text-stone-100 mb-4">Add colleges to compare</h2>
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Type a college name (e.g., Stanford, UCLA, MIT)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-[#44403c] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black dark:text-stone-100 placeholder-gray-500 dark:placeholder-stone-500 bg-white dark:bg-[#1c1917]"
            />
            {loadingSuggestions && (
              <div className="absolute right-3 top-3.5 text-gray-500 dark:text-stone-400 text-sm">Loading...</div>
            )}

            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 w-full mt-1 bg-white dark:bg-[#292524] border-2 border-gray-300 dark:border-[#44403c] rounded-lg shadow-lg max-h-80 overflow-y-auto"
              >
                {suggestions.map((college) => (
                  <button
                    key={college.id}
                    onClick={() => selectSuggestion(college)}
                    className="w-full px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-[#44403c] border-b border-gray-100 dark:border-[#44403c] last:border-b-0"
                  >
                    <div className="font-semibold text-black dark:text-stone-100">{college.name}</div>
                    <div className="text-sm text-gray-600 dark:text-stone-400">
                      {college.city}, {college.state} • {formatCurrency(college.cost.avgNetPrice)}/yr
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedColleges.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedColleges.map((college) => (
                <div
                  key={college.id}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded-full"
                >
                  <span className="font-medium">{college.name}</span>
                  <button
                    onClick={() => removeFromComparison(college.id)}
                    className="hover:text-indigo-600 dark:hover:text-indigo-200"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        {selectedColleges.length > 0 && (
          <div className="bg-white dark:bg-[#292524] rounded-lg shadow-md p-6 mb-6 border border-gray-200 dark:border-[#44403c]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-black dark:text-stone-100">Quick Comparison</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-gray-600 dark:text-stone-400">Include room & board</span>
                <button
                  onClick={() => setIncludeRoomBoard(!includeRoomBoard)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${includeRoomBoard ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${includeRoomBoard ? 'translate-x-5' : ''}`} />
                </button>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-[#44403c]">
                    <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">School</th>
                    <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">
                      <div>Retail Price/yr</div>
                      <div className="text-xs font-normal">{includeRoomBoard ? "(tuition + room & board)" : "(tuition only)"}</div>
                    </th>
                    <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">
                      <div>Your Price/yr *</div>
                      <div className="text-xs font-normal">(based on income)</div>
                    </th>
                    <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">4-Year Cost</th>
                    <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">Grad Rate</th>
                    <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-stone-400">Acceptance</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedColleges.map((college) => {
                    const isInState = college.state === profile.homeState;
                    const tuition = isInState ? college.cost.tuitionInState : college.cost.tuitionOutOfState;
                    const retailPerYear = includeRoomBoard
                      ? (tuition || 0) + (college.cost.roomBoardOnCampus || 0)
                      : tuition;
                    const yourPricePerYear = college.cost.netPriceByIncome?.[profile.incomeBracket] ?? college.cost.avgNetPrice;
                    return (
                      <tr key={college.id} className="border-b border-gray-100 dark:border-[#44403c]">
                        <td className="py-3 px-4">
                          <div className="font-bold text-black dark:text-stone-100">{college.name}</div>
                          <div className="text-sm text-gray-500 dark:text-stone-500">{college.city}, {college.state}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-black dark:text-stone-100">
                          {formatCurrency(retailPerYear)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-blue-600 dark:text-blue-400">
                          {yourPricePerYear && retailPerYear && yourPricePerYear <= retailPerYear
                            ? formatCurrency(yourPricePerYear)
                            : "—"}
                        </td>
                        <td className="py-3 px-4 font-bold text-black dark:text-stone-100">
                          {formatCurrency(retailPerYear ? retailPerYear * 4 : null)}
                        </td>
                        <td className="py-3 px-4 text-black dark:text-stone-100">
                          {formatPercent(college.outcomes?.graduationRate6yr)}
                        </td>
                        <td className="py-3 px-4 text-black dark:text-stone-100">
                          {formatPercent(college.admissions?.acceptanceRate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 dark:text-stone-500 mt-3">* Average paid by families in your income bracket who filed for federal aid. Families paying full price without FAFSA aren&apos;t included.</p>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-wrap gap-4 items-start">
              <button
                onClick={generateLifePaths}
                disabled={pathsLoading || selectedColleges.length === 0}
                className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {pathsLoading ? "Generating..." : lifePaths.length > 0 ? "🔮 Refresh Life Paths" : "🔮 Show My Life Paths"}
              </button>

              <div className="flex flex-col">
                <button
                  onClick={generateAnalysis}
                  disabled={analysisLoading || selectedColleges.length < 2}
                  className="px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analysisLoading ? "Analyzing..." : analysisResult ? "🤖 Refresh Analysis" : "🤖 AI Analysis"}
                </button>
                {selectedColleges.length < 2 && (
                  <span className="text-sm text-gray-500 dark:text-stone-500 mt-1">Add 2+ colleges to compare</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Life Paths */}
        {lifePaths.length > 0 && (() => {
          const lowestDebtId = lifePaths.length > 1
            ? lifePaths.reduce((min, p) => p.summary.peakDebt < min.summary.peakDebt ? p : min).college.id
            : null;
          return (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
            <h2 className="text-lg font-bold text-black mb-2">Your Life Paths</h2>
            <p className="text-gray-600 mb-6">
              Here&apos;s what your life could look like with each choice, based on {MAJOR_CATEGORIES.find(m => m.value === profile.intendedMajor)?.label} earnings data.
            </p>

            <div className="space-y-8">
              {lifePaths.map((path) => (
                <div key={path.college.id} className="border-2 border-gray-200 rounded-xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-black">{path.college.name}</h3>
                        {lowestDebtId === path.college.id && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                            💰 Lowest Debt
                          </span>
                        )}
                      </div>
                      {path.occupation ? (
                        <div className="mt-1">
                          <p className="text-sm font-medium text-indigo-600">
                            {path.occupation.title}
                          </p>
                          <p className="text-gray-600">
                            {formatCurrency(path.occupation.salaryRange.low)} - {formatCurrency(path.occupation.salaryRange.high)}/yr
                            <span className="ml-2 text-sm text-gray-500">
                              in {path.occupation.location}
                            </span>
                          </p>
                          {path.occupation.growthRate > 0 && (
                            <p className="text-xs text-green-600 mt-1">
                              +{path.occupation.growthRate}% job growth projected (BLS)
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-600">
                          {path.major} • Expected earnings: {formatCurrency(path.majorEarnings)}/yr
                        </p>
                      )}
                    </div>
                    <div className={`px-4 py-2 rounded-lg font-bold ${
                      path.summary.netWorthAt35 > 200000 ? "bg-green-100 text-green-800" :
                      path.summary.netWorthAt35 > 50000 ? "bg-blue-100 text-blue-800" :
                      path.summary.netWorthAt35 > 0 ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      Net worth at 35: {formatCurrency(path.summary.netWorthAt35)}
                    </div>
                  </div>

                  {/* Warning */}
                  {path.summary.warning && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <p className="text-red-800 font-medium">⚠️ {path.summary.warning}</p>
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Total Cost</div>
                      <div className="text-xl font-bold text-black">{formatCurrency(path.summary.totalCost)}</div>
                      <div className="mt-2 space-y-1">
                        {path.summary.costBreakdown.aidAdjustedUndergrad &&
                         path.summary.costBreakdown.aidAdjustedUndergrad <= path.summary.costBreakdown.undergradWithRoomBoard && (
                          <div className="text-sm font-semibold text-green-700">You pay: {formatCurrency(path.summary.costBreakdown.aidAdjustedUndergrad)}</div>
                        )}
                        <div className="text-xs text-gray-400">Retail: {formatCurrency(path.summary.costBreakdown.undergradWithRoomBoard)}</div>
                        <div className="text-xs text-gray-300">Tuition only: {formatCurrency(path.summary.costBreakdown.undergradTuitionOnly)}</div>
                        {path.summary.costBreakdown.gradSchoolCost > 0 && (
                          <div className="text-xs text-gray-400 pt-1">+ Grad school: {formatCurrency(path.summary.costBreakdown.gradSchoolCost)}</div>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Peak Debt</div>
                      <div className="text-xl font-bold text-red-600">{formatCurrency(path.summary.peakDebt)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Loan Payment</div>
                      <div className="text-xl font-bold text-red-600">
                        {path.summary.peakDebt > 0 ? `${formatCurrency(calculateMonthlyPayment(path.summary.peakDebt))}/mo` : "—"}
                      </div>
                      {path.summary.peakDebt > 0 && (
                        <div className="text-[10px] text-gray-400">10yr @ 7.5% on peak debt</div>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Total Interest</div>
                      <div className="text-xl font-bold text-red-600">
                        {path.summary.peakDebt > 0 ? formatCurrency(calculateTotalInterest(path.summary.peakDebt)) : "—"}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Break Even Age</div>
                      <div className="text-xl font-bold text-black">
                        {path.summary.breakEvenAge ? `Age ${path.summary.breakEvenAge}` : "35+"}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500">Net Worth at 35</div>
                      <div className={`text-xl font-bold ${path.summary.netWorthAt35 >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(path.summary.netWorthAt35)}
                      </div>
                    </div>
                  </div>

                  {/* Year by year */}
                  <details className="mt-4">
                    <summary className="cursor-pointer text-indigo-600 font-medium hover:text-indigo-700">
                      View year-by-year breakdown →
                    </summary>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-3 text-gray-600">Age</th>
                            <th className="text-left py-2 px-3 text-gray-600">Phase</th>
                            <th className="text-left py-2 px-3 text-gray-600">What&apos;s happening</th>
                            <th className="text-right py-2 px-3 text-gray-600">Earnings</th>
                            <th className="text-right py-2 px-3 text-gray-600">Debt</th>
                            <th className="text-right py-2 px-3 text-gray-600">Net Worth</th>
                          </tr>
                        </thead>
                        <tbody>
                          {path.timeline.map((year) => (
                            <tr key={year.year} className="border-b border-gray-100">
                              <td className="py-2 px-3 font-medium text-black">{year.age}</td>
                              <td className="py-2 px-3 text-gray-600">{year.phase}</td>
                              <td className="py-2 px-3 text-gray-800">{year.description}</td>
                              <td className="py-2 px-3 text-right text-green-600">
                                {year.earnings ? formatCurrency(year.earnings) : "-"}
                              </td>
                              <td className="py-2 px-3 text-right text-red-600">
                                {year.debt > 0 ? `-${formatCurrency(year.debt)}` : "-"}
                              </td>
                              <td className={`py-2 px-3 text-right font-medium ${year.netWorth >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {formatCurrency(year.netWorth)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        );})()}

        {/* Hard Questions */}
        {lifePaths.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
            <h2 className="text-lg font-bold text-black mb-2">Before You Decide...</h2>
            <p className="text-gray-600 mb-6">
              Numbers matter, but so does fit. Think through these questions.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border-l-4 border-indigo-500 pl-4">
                <h3 className="font-bold text-black mb-2">About Money</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• How much debt are you comfortable graduating with?</li>
                  <li>• Could your family help if you ran out of money junior year?</li>
                  <li>• Are you willing to work part-time during school?</li>
                </ul>
              </div>

              <div className="border-l-4 border-purple-500 pl-4">
                <h3 className="font-bold text-black mb-2">About Location</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Do you need to stay close to home?</li>
                  <li>• How do you feel about cold/hot weather?</li>
                  <li>• Big city or college town vibe?</li>
                </ul>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-bold text-black mb-2">About Environment</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Do you want small classes or are you OK in 300-person lectures?</li>
                  <li>• Is Greek life/sports culture important to you?</li>
                  <li>• How important is campus diversity?</li>
                </ul>
              </div>

              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-bold text-black mb-2">About Career</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Does this school place people into your target industry?</li>
                  <li>• Is the alumni network strong in the field you want?</li>
                  <li>• Are there internship opportunities nearby?</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 font-medium">
                💡 The "best" school isn't always the highest ranked. It's the one where you'll thrive, graduate, and not drown in debt.
              </p>
            </div>
          </div>
        )}

        {/* AI Analysis */}
        {analysisResult && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
            <h2 className="text-lg font-bold text-black mb-4">🤖 AI Analysis</h2>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
              <p className="text-purple-900 font-medium">{analysisResult.summary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {analysisResult.colleges.map((analysis) => (
                <div key={analysis.id} className="border-2 border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-black">{analysis.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      analysis.verdict === "Excellent" ? "bg-green-100 text-green-800" :
                      analysis.verdict === "Good" ? "bg-blue-100 text-blue-800" :
                      analysis.verdict === "Fair" ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {analysis.verdict}
                    </span>
                  </div>

                  {analysis.warning && (
                    <div className="bg-red-50 rounded p-2 mb-3 text-sm text-red-700">
                      ⚠️ {analysis.warning}
                    </div>
                  )}

                  <div className="mb-3">
                    <div className="font-medium text-green-700 text-sm mb-1">✓ Why choose</div>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {analysis.whyChoose.map((r, i) => <li key={i}>• {r}</li>)}
                    </ul>
                  </div>

                  <div className="mb-3">
                    <div className="font-medium text-red-700 text-sm mb-1">✗ Concerns</div>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {analysis.whyNot.map((r, i) => <li key={i}>• {r}</li>)}
                    </ul>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-sm text-amber-900">
                    <span className="font-medium">Best for:</span> {analysis.bestFor}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="font-bold text-blue-800 mb-1">💡 Recommendation</div>
              <p className="text-blue-900">{analysisResult.recommendation}</p>
            </div>

            {analysisResult.alternativePath && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                <div className="font-bold text-green-800 mb-1">💰 Money-saving alternative</div>
                <p className="text-green-900">{analysisResult.alternativePath}</p>
              </div>
            )}
          </div>
        )}

        {/* Decision Matrix */}
        {lifePaths.length >= 2 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
            <h2 className="text-lg font-bold text-black mb-2">Decision Matrix</h2>
            <p className="text-gray-600 mb-6">
              Side-by-side comparison on what matters most.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-4 font-bold text-gray-600">Factor</th>
                    {lifePaths.map((path) => (
                      <th key={path.college.id} className="text-center py-3 px-4 font-bold text-gray-900">
                        {path.college.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Affordability */}
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-gray-700">
                      <div>💰 Affordability</div>
                      <div className="text-xs text-gray-500">Lower cost = higher score</div>
                    </td>
                    {lifePaths.map((path) => {
                      const minCost = Math.min(...lifePaths.map(p => p.summary.totalCost));
                      const score = path.summary.totalCost <= minCost * 1.2 ? 5 :
                                   path.summary.totalCost <= minCost * 1.5 ? 4 :
                                   path.summary.totalCost <= minCost * 2 ? 3 : 2;
                      return (
                        <td key={path.college.id} className="py-3 px-4 text-center">
                          <div className="flex justify-center">
                            {Array.from({ length: 5 }, (_, i) => (
                              <span key={i} className={i < score ? "text-green-500" : "text-gray-300"}>●</span>
                            ))}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{formatCurrency(path.summary.totalCost)}</div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Earning Potential */}
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-gray-700">
                      <div>📈 Earning Potential</div>
                      <div className="text-xs text-gray-500">Expected salary for your major</div>
                    </td>
                    {lifePaths.map((path) => {
                      const maxEarnings = Math.max(...lifePaths.map(p => p.majorEarnings || 0));
                      const earnings = path.majorEarnings || 0;
                      const score = earnings >= maxEarnings * 0.95 ? 5 :
                                   earnings >= maxEarnings * 0.85 ? 4 :
                                   earnings >= maxEarnings * 0.75 ? 3 : 2;
                      return (
                        <td key={path.college.id} className="py-3 px-4 text-center">
                          <div className="flex justify-center">
                            {Array.from({ length: 5 }, (_, i) => (
                              <span key={i} className={i < score ? "text-green-500" : "text-gray-300"}>●</span>
                            ))}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{formatCurrency(earnings)}/yr</div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Net Worth at 35 */}
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-gray-700">
                      <div>🎯 Long-term Value</div>
                      <div className="text-xs text-gray-500">Net worth at age 35</div>
                    </td>
                    {lifePaths.map((path) => {
                      const maxNW = Math.max(...lifePaths.map(p => p.summary.netWorthAt35));
                      const nw = path.summary.netWorthAt35;
                      const score = nw >= maxNW * 0.9 ? 5 :
                                   nw >= maxNW * 0.7 ? 4 :
                                   nw >= maxNW * 0.5 ? 3 : 2;
                      return (
                        <td key={path.college.id} className="py-3 px-4 text-center">
                          <div className="flex justify-center">
                            {Array.from({ length: 5 }, (_, i) => (
                              <span key={i} className={i < score ? "text-green-500" : "text-gray-300"}>●</span>
                            ))}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{formatCurrency(nw)}</div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Graduation Rate */}
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-gray-700">
                      <div>🎓 Graduation Rate</div>
                      <div className="text-xs text-gray-500">6-year completion</div>
                    </td>
                    {selectedColleges.map((college) => {
                      const rate = college.outcomes?.graduationRate6yr || 0;
                      const score = rate >= 0.9 ? 5 : rate >= 0.8 ? 4 : rate >= 0.7 ? 3 : rate >= 0.6 ? 2 : 1;
                      return (
                        <td key={college.id} className="py-3 px-4 text-center">
                          <div className="flex justify-center">
                            {Array.from({ length: 5 }, (_, i) => (
                              <span key={i} className={i < score ? "text-green-500" : "text-gray-300"}>●</span>
                            ))}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{formatPercent(rate)}</div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Break Even */}
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-gray-700">
                      <div>⏱️ Time to Break Even</div>
                      <div className="text-xs text-gray-500">When earnings offset debt</div>
                    </td>
                    {lifePaths.map((path) => {
                      const age = path.summary.breakEvenAge || 40;
                      const score = age <= 23 ? 5 : age <= 25 ? 4 : age <= 28 ? 3 : age <= 32 ? 2 : 1;
                      return (
                        <td key={path.college.id} className="py-3 px-4 text-center">
                          <div className="flex justify-center">
                            {Array.from({ length: 5 }, (_, i) => (
                              <span key={i} className={i < score ? "text-green-500" : "text-gray-300"}>●</span>
                            ))}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {path.summary.breakEvenAge ? `Age ${path.summary.breakEvenAge}` : "35+"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Winner banner */}
            {(() => {
              const winner = lifePaths.reduce((best, current) =>
                current.summary.netWorthAt35 > best.summary.netWorthAt35 ? current : best
              );
              return (
                <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                  <p className="text-indigo-900">
                    <span className="font-bold">Based on pure numbers: </span>
                    {winner.college.name} gives you the highest net worth at 35 ({formatCurrency(winner.summary.netWorthAt35)})
                  </p>
                  <p className="text-indigo-700 text-sm mt-1">
                    But remember — numbers don&apos;t capture everything. Consider the questions above.
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {/* Empty state */}
        {selectedColleges.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg shadow-md border border-gray-200">
            <p className="text-xl text-gray-800 mb-2">Search for colleges to compare</p>
            <p className="text-gray-600">
              We&apos;ll show you what your life could look like with each choice
            </p>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
