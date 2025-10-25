"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Github, Search, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type OnboardingStep = "landing" | "auth" | "repos" | "sandbox" | "metrics" | "instrumentation";

export default function Home() {
  const [step, setStep] = useState<OnboardingStep>("landing");
  const [expandedMetric, setExpandedMetric] = useState<number | null>(null);
  const [selectedRepos, setSelectedRepos] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Hardcoded data for mockup
  const mockRepos = [
    { id: 1, name: "my-nextjs-app", fullName: "user/my-nextjs-app", description: "A Next.js application" },
    { id: 2, name: "api-backend", fullName: "user/api-backend", description: "FastAPI backend service" },
    { id: 3, name: "mobile-app", fullName: "user/mobile-app", description: "React Native mobile app" },
    { id: 4, name: "landing-page", fullName: "user/landing-page", description: "Marketing landing page" },
  ];

  const mockMetrics = [
    {
      id: 1,
      title: "User Onboarding Completion Rate",
      description: "Track how many users complete the onboarding flow",
      featureName: "Onboarding",
      metricType: "conversion",
      sqlQuery: "SELECT COUNT(*) FROM users WHERE onboarding_step = 5 / COUNT(*) FROM users",
    },
    {
      id: 2,
      title: "Dashboard Daily Active Users",
      description: "Measure daily active users accessing the dashboard",
      featureName: "Dashboard",
      metricType: "engagement",
      sqlQuery: "SELECT COUNT(DISTINCT user_id) FROM dashboard_views WHERE created_at >= NOW() - INTERVAL '1 day'",
    },
    {
      id: 3,
      title: "Payment Success Rate",
      description: "Monitor successful payment transactions vs. failed attempts",
      featureName: "Payments",
      metricType: "conversion",
      sqlQuery: "SELECT COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*) FROM payments",
    },
  ];

  const agentMessages = [
    "Cloning repositories...",
    "Analyzing code structure...",
    "Detecting features in codebase...",
    "Identifying authentication flows...",
    "Mapping user journeys...",
    "Generating product metrics...",
  ];

  const toggleRepo = (id: number) => {
    setSelectedRepos(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const filteredRepos = mockRepos.filter(repo =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStepTitle = () => {
    switch (step) {
      case "landing":
        return "";
      case "auth":
        return "Authentication";
      case "repos":
        return "Repositories";
      case "sandbox":
        return "Analysis";
      case "metrics":
        return "Metrics";
      case "instrumentation":
        return "Implementation";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] font-[var(--font-noto-sans-jp)]">
      {/* Fixed Header for non-landing steps */}
      {step !== "landing" && (
        <div className="fixed top-0 left-0 right-0 bg-[#FAFAF9]/95 backdrop-blur-sm z-10 border-b border-neutral-200">
          <div className="max-w-2xl mx-auto px-6 py-6">
            <h2 className="text-sm font-bold tracking-[0.3em] text-neutral-700 uppercase">
              {getStepTitle()}
            </h2>
          </div>
        </div>
      )}

      {/* Content Container */}
      <div className={step !== "landing" ? "pt-24" : ""}>
        {/* Step 1: Landing */}
        {step === "landing" && (
          <div className="min-h-screen flex items-center justify-center px-6 animate-fade-in">
            <div className="text-center space-y-12 max-w-xl">
              <div className="space-y-8">
                <div className="inline-block p-6 border-2 border-neutral-300">
                  <span className="text-5xl font-bold text-neutral-900">K</span>
                </div>
                <h1 className="text-7xl font-extrabold tracking-[0.3em] text-neutral-900 font-[var(--font-inter)]">
                  KAPIN
                </h1>
                <p className="text-base font-normal text-neutral-600 tracking-wide">
                  easy product metrics instrumentation
                </p>
              </div>
              <Button
                size="lg"
                className="bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-medium tracking-wide px-12 py-6 text-base border-none shadow-none"
                onClick={() => setStep("auth")}
              >
                Get Started
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Auth */}
        {step === "auth" && (
          <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 animate-fade-in">
            <div className="w-full max-w-md space-y-12">
              <div className="text-center space-y-8">
                <div className="inline-block p-4 border-2 border-neutral-300">
                  <span className="text-3xl font-bold text-neutral-900">K</span>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-medium tracking-wide py-6 border-none shadow-none"
                onClick={() => setStep("repos")}
              >
                <Github className="mr-3 h-5 w-5" />
                Sign in with GitHub
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Repository Selection */}
        {step === "repos" && (
          <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 animate-fade-in">
            <div className="w-full max-w-2xl space-y-8">
              <p className="text-center text-sm font-normal text-neutral-500">
                Choose the repositories that belong to the same project
              </p>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="Search..."
                  className="pl-12 border-neutral-300 bg-white font-normal"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                {filteredRepos.map((repo) => (
                  <div
                    key={repo.id}
                    className={`border cursor-pointer transition-all bg-white p-6 ${
                      selectedRepos.includes(repo.id)
                        ? "border-[#7AC74F] bg-[#7AC74F]/5"
                        : "border-neutral-200 hover:border-neutral-300"
                    }`}
                    onClick={() => toggleRepo(repo.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <h3 className="font-semibold text-neutral-900">{repo.name}</h3>
                        <p className="text-xs text-neutral-500 font-normal">{repo.fullName}</p>
                        <p className="text-sm text-neutral-600 font-normal">{repo.description}</p>
                      </div>
                      <div
                        className={`w-5 h-5 border flex items-center justify-center transition-all ${
                          selectedRepos.includes(repo.id)
                            ? "bg-[#7AC74F] border-[#7AC74F]"
                            : "border-neutral-300"
                        }`}
                      >
                        {selectedRepos.includes(repo.id) && (
                          <span className="text-neutral-900 text-xs">✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                className="w-full bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-normal tracking-wide border-none shadow-none"
                disabled={selectedRepos.length === 0}
                onClick={() => setStep("sandbox")}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Sandbox Creation */}
        {step === "sandbox" && (
          <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 animate-fade-in">
            <div className="text-center space-y-12 max-w-lg">
              <Loader2 className="h-16 w-16 mx-auto animate-spin text-neutral-400" strokeWidth={1} />
              <div className="space-y-6">
                <h3 className="text-2xl font-normal tracking-[0.2em] text-neutral-900 font-[var(--font-inter)]">
                  WAKE UP KAPIN
                </h3>
                <div className="space-y-3">
                  {agentMessages.map((message, idx) => (
                    <p
                      key={idx}
                      className="text-sm font-normal text-neutral-500 animate-pulse"
                      style={{ animationDelay: `${idx * 200}ms` }}
                    >
                      {message}
                    </p>
                  ))}
                </div>
              </div>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setStep("metrics")}
                className="border-neutral-300 font-normal"
              >
                Skip to Results
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Product Metrics Results */}
        {step === "metrics" && (
          <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 animate-fade-in">
            <div className="w-full max-w-2xl space-y-8 py-12">
              <p className="text-center text-sm font-normal text-neutral-500">
                KAPIN discovered {mockMetrics.length} potential metrics for your project
              </p>

              <div className="space-y-4">
                {mockMetrics.map((metric) => (
                  <div key={metric.id} className="border border-neutral-200 bg-white overflow-hidden">
                    <div
                      className="cursor-pointer hover:bg-neutral-50 transition-colors p-6"
                      onClick={() =>
                        setExpandedMetric(expandedMetric === metric.id ? null : metric.id)
                      }
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-neutral-900">{metric.title}</h3>
                            <span className="px-2 py-1 text-xs border border-neutral-300 text-neutral-600 font-normal">
                              {metric.metricType}
                            </span>
                          </div>
                          <p className="text-sm font-normal text-neutral-600">{metric.description}</p>
                        </div>
                        {expandedMetric === metric.id ? (
                          <ChevronUp className="h-5 w-5 text-neutral-400" strokeWidth={1.5} />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-neutral-400" strokeWidth={1.5} />
                        )}
                      </div>
                    </div>

                    {expandedMetric === metric.id && (
                      <div className="border-t border-neutral-200 p-6 space-y-6 animate-fade-in">
                        <div>
                          <h4 className="text-xs font-normal mb-2 text-neutral-500 uppercase tracking-wider">Feature</h4>
                          <p className="text-sm font-normal text-neutral-900">{metric.featureName}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-normal mb-2 text-neutral-500 uppercase tracking-wider">SQL Query</h4>
                          <pre className="bg-neutral-50 p-4 text-xs font-normal text-neutral-700 overflow-x-auto border border-neutral-200">
                            {metric.sqlQuery}
                          </pre>
                        </div>
                        <Button
                          className="w-full bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-normal tracking-wide border-none shadow-none"
                          onClick={() => setStep("instrumentation")}
                        >
                          How to Apply
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Instrumentation Guide */}
        {step === "instrumentation" && (
          <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 animate-fade-in">
            <div className="w-full max-w-2xl space-y-8 py-12">
              <p className="text-center text-sm font-normal text-neutral-500">
                Follow these steps to instrument "User Onboarding Completion Rate"
              </p>

              <div className="space-y-6">
                <div className="border border-neutral-200 bg-white">
                  <div className="p-6 border-b border-neutral-200">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Database Migration</h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-sm font-normal text-neutral-600">
                      Add a column to track onboarding progress:
                    </p>
                    <pre className="bg-neutral-50 p-4 text-xs font-normal text-neutral-700 overflow-x-auto border border-neutral-200">
{`ALTER TABLE users
ADD COLUMN onboarding_step INTEGER DEFAULT 0;`}
                    </pre>
                  </div>
                </div>

                <div className="border border-neutral-200 bg-white">
                  <div className="p-6 border-b border-neutral-200">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Code Instrumentation</h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-sm font-normal text-neutral-600">
                      Add this code to track onboarding progress:
                    </p>
                    <pre className="bg-neutral-50 p-4 text-xs font-normal text-neutral-700 overflow-x-auto border border-neutral-200">
{`// In your onboarding component
const completeOnboardingStep = async (step: number) => {
  await db.users.update({
    where: { id: userId },
    data: { onboarding_step: step }
  });
};`}
                    </pre>
                  </div>
                </div>

                <div className="border border-neutral-200 bg-white">
                  <div className="p-6 border-b border-neutral-200">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Calculate Metric</h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-sm font-normal text-neutral-600">
                      Use this query to calculate the completion rate:
                    </p>
                    <pre className="bg-neutral-50 p-4 text-xs font-normal text-neutral-700 overflow-x-auto border border-neutral-200">
{`SELECT
  COUNT(*) FILTER (WHERE onboarding_step = 5) * 100.0 / COUNT(*) as completion_rate
FROM users
WHERE created_at >= NOW() - INTERVAL '30 days';`}
                    </pre>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="border-neutral-300 font-normal"
                    onClick={() => setStep("metrics")}
                  >
                    Back
                  </Button>
                  <Button
                    className="bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-normal tracking-wide border-none shadow-none"
                    onClick={() => setStep("landing")}
                  >
                    Start Over
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Debug Navigation */}
      <div className="fixed bottom-4 right-4 bg-white p-4 border border-neutral-200 shadow-sm">
        <p className="text-xs font-normal mb-2 text-neutral-500">Debug</p>
        <div className="flex flex-wrap gap-2">
          {(["landing", "auth", "repos", "sandbox", "metrics", "instrumentation"] as OnboardingStep[]).map((s) => (
            <button
              key={s}
              className={`px-2 py-1 text-xs font-normal border transition-all ${
                step === s
                  ? "bg-[#A8D5BA] border-[#A8D5BA] text-neutral-900"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
              }`}
              onClick={() => setStep(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
