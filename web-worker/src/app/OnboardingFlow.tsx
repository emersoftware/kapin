"use client";

import { useState, useEffect, useRef } from "react";
import { handleGithubSignIn, handleSignOut, updateOnboardingStep, createProjectWithRepos } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Github, Search, Loader2, ChevronDown, ChevronUp, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

interface OnboardingFlowProps {
  initialStep: number;
  userId?: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  private: boolean;
  language?: string | null;
}

interface ProductMetric {
  id: string;
  projectId: string;
  runId: string;
  title: string;
  description: string;
  featureName: string;
  metricType: string;
  sqlQuery: string | null;
  metadata: unknown;
  createdAt: Date;
}

export default function OnboardingFlow({ initialStep, userId }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<number>(initialStep);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [selectedRepos, setSelectedRepos] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);

  // Real GitHub repositories state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Project and run state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<ProductMetric[]>([]);
  const isInitializingRun = useRef(false);
  const wsRef = useRef<WebSocket | null>(null); // Persist WebSocket across steps
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null); // Persist poll interval

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  // Load repositories when step is 1 (repos selection)
  useEffect(() => {
    if (step === 1) {
      loadRepositories();
    }
  }, [step]);

  // Search repositories with debounce
  useEffect(() => {
    if (step !== 1) return;

    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchRepositories(searchQuery);
      } else {
        loadRepositories();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, step]);

  // Handle step 2: Create run, start agent, connect WebSocket
  useEffect(() => {
    if (step !== 2) return;

    // Prevent duplicate runs (React StrictMode executes effects twice)
    if (isInitializingRun.current) {
      console.log("Already initializing run, skipping...");
      return;
    }

    const initializeRun = async () => {
      isInitializingRun.current = true;

      try {
        // If no projectId, load the most recent project
        let currentProjectId = projectId;
        if (!currentProjectId) {
          const projectsResponse = await fetch("/api/projects/latest");
          if (!projectsResponse.ok) {
            console.error("Failed to load latest project");
            return;
          }
          const { projectId: latestProjectId } = await projectsResponse.json();
          if (!latestProjectId) {
            console.error("No project found");
            return;
          }
          currentProjectId = latestProjectId;
          setProjectId(currentProjectId);
        }

        // Create run
        const createRunResponse = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId }),
        });

        if (!createRunResponse.ok) {
          throw new Error("Failed to create run");
        }

        const { runId: newRunId } = await createRunResponse.json();
        setRunId(newRunId);

        // Connect WebSocket FIRST (before starting the agent)
        const isDev = window.location.hostname === "localhost";
        const agentsWorkerUrl = isDev
          ? "ws://localhost:8788"
          : "wss://kapin-agents-worker.e-benjaminsalazarrubilar.workers.dev";
        const wsUrl = `${agentsWorkerUrl}/ws/${newRunId}`;
        console.log("Connecting to WebSocket:", wsUrl);
        wsRef.current = new WebSocket(wsUrl);

        // Wait for WebSocket to be ready before starting the agent
        await new Promise<void>((resolve, reject) => {
          if (!wsRef.current) {
            reject(new Error("WebSocket not initialized"));
            return;
          }

          const timeout = setTimeout(() => {
            reject(new Error("WebSocket connection timeout"));
          }, 5000);

          wsRef.current.onopen = () => {
            console.log("WebSocket connected - now starting agent");
            clearTimeout(timeout);
            resolve();
          };

          wsRef.current.onerror = (error) => {
            console.error("WebSocket connection error:", error);
            clearTimeout(timeout);
            reject(error);
          };
        });

        // Now that WebSocket is connected, setup message handlers
        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "progress") {
              setAgentMessages((prev) => [...prev, data.message]);
            } else if (data.type === "metrics_generated") {
              console.log("📊 Metrics received:", data.metrics.length);

              // Append new metrics (don't overwrite)
              setMetrics((prev) => {
                const newMetrics = [...prev, ...data.metrics];
                console.log(`Total metrics now: ${newMetrics.length}`);
                return newMetrics;
              });

              // Move to step 3 immediately on first metrics
              setStep((currentStep) => {
                if (currentStep === 2) {
                  console.log("✅ Moving to step 3 (first metrics received)");
                  return 3;
                }
                return currentStep;
              });
            } else if (data.type === "completed") {
              console.log("✅ Agent completed");
              // Don't change step here - already moved to step 3 on first metrics
            } else if (data.type === "error") {
              console.error("Agent error:", data.error);
              setAgentMessages((prev) => [...prev, `Error: ${data.error}`]);
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        wsRef.current.onclose = () => {
          console.log("WebSocket disconnected");
        };

        // Start the agent NOW (after WebSocket is connected)
        console.log("Starting agent for run:", newRunId);
        const startRunResponse = await fetch(`/api/runs/${newRunId}/start`, {
          method: "POST",
        });

        if (!startRunResponse.ok) {
          throw new Error("Failed to start run");
        }
        console.log("Agent started successfully");

        // Fallback: Poll for metrics every 3 seconds if WebSocket fails
        pollIntervalRef.current = setInterval(async () => {
          if (!newRunId) return;

          try {
            const metricsResponse = await fetch(`/api/runs/${newRunId}/metrics`);
            if (metricsResponse.ok) {
              const { metrics: fetchedMetrics } = await metricsResponse.json();
              if (fetchedMetrics && fetchedMetrics.length > 0) {
                console.log("Metrics found via polling, moving to step 3");
                setMetrics((prev) => [...prev, ...fetchedMetrics]); // Append, don't overwrite
                setStep(3);
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                }
              }
            }
          } catch (error) {
            console.error("Error polling for metrics:", error);
          }
        }, 3000);
      } catch (error) {
        console.error("Error initializing run:", error);
        // Reset flag on error to allow retry
        isInitializingRun.current = false;
      }
    };

    initializeRun();

    // Cleanup: only clear polling, WebSocket stays open to listen for metrics in step 3
    return () => {
      // Clear polling interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      // Note: WebSocket is kept open to continue listening for metrics
      // It will be cleaned up when component unmounts (see separate useEffect)
    };
  }, [step, projectId]);

  // Cleanup WebSocket when component unmounts completely
  useEffect(() => {
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log("Component unmounting - closing WebSocket");
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const loadRepositories = async () => {
    setIsLoadingRepos(true);
    try {
      const response = await fetch("/api/github/repos?per_page=100");
      if (!response.ok) throw new Error("Failed to fetch repositories");

      const data = await response.json();
      setRepos(data.repositories);
    } catch (error) {
      console.error("Error loading repositories:", error);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const searchRepositories = async (query: string) => {
    setIsSearching(true);
    try {
      const response = await fetch(`/api/github/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Failed to search repositories");

      const data = await response.json();
      setRepos(data.repositories);
    } catch (error) {
      console.error("Error searching repositories:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setIsCompletingOnboarding(true);
    try {
      await updateOnboardingStep(4);
      router.push("/projects");
      router.refresh();
    } catch (error) {
      console.error("Error completing onboarding:", error);
      setIsCompletingOnboarding(false);
    }
  };

  const handleContinueWithRepos = async () => {
    setIsCreatingProject(true);
    try {
      // Generate a default project name based on selected repos
      const selectedRepoNames = repos
        .filter((repo) => selectedRepos.includes(repo.id))
        .map((repo) => repo.name);

      const projectName = selectedRepoNames.length === 1
        ? selectedRepoNames[0]
        : `${selectedRepoNames[0]} and ${selectedRepoNames.length - 1} other${selectedRepoNames.length > 2 ? "s" : ""}`;

      const result = await createProjectWithRepos({
        projectName,
        repoIds: selectedRepos,
      });

      if (result.success && result.projectId) {
        // Save project ID
        setProjectId(result.projectId);
        // Move to step 2 (sandbox/agent running)
        router.refresh();
      } else {
        console.error("Error creating project:", result.error);
        setIsCreatingProject(false);
      }
    } catch (error) {
      console.error("Error creating project:", error);
      setIsCreatingProject(false);
    }
  };


  const toggleRepo = (id: number) => {
    setSelectedRepos(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const getStepTitle = () => {
    switch (step) {
      case 0:
        return "";
      case 1:
        return "Repositories";
      case 2:
        return "Analysis";
      case 3:
        return "Metrics";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] font-[var(--font-noto-sans-jp)]">
      {/* Fixed Header for non-landing steps */}
      {step !== 0 && (
        <div className="fixed top-0 left-0 right-0 bg-[#FAFAF9]/95 backdrop-blur-sm z-10 border-b border-neutral-200">
          <div className="max-w-2xl mx-auto px-6 py-6">
            <h2 className="text-sm font-bold tracking-[0.3em] text-neutral-700 uppercase">
              {getStepTitle()}
            </h2>
          </div>
        </div>
      )}

      {/* Logout Button - Show when logged in (step >= 1) */}
      {step >= 1 && (
        <div className="fixed top-6 right-6 z-50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSignOut()}
            className="text-neutral-600 hover:text-neutral-900"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      )}

      {/* Content Container */}
      <div className={step !== 0 ? "pt-24" : ""}>
        {/* Step 0: Landing + Auth */}
        {step === 0 && (
          <div className="min-h-screen flex items-center justify-center px-6 animate-fade-in">
            <div className="text-center space-y-12 max-w-xl">
              <div className="space-y-8">
                <div className="flex items-center justify-center">
                  <img
                    src="/kapin-logo.png"
                    alt="KAPIN Logo"
                    className="h-64 w-auto"
                  />
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
                onClick={() => handleGithubSignIn()}
              >
                <Github className="mr-3 h-5 w-5" />
                Sign in with GitHub
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Repository Selection */}
        {step === 1 && (
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

              {isLoadingRepos || isSearching ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-neutral-400" strokeWidth={1.5} />
                </div>
              ) : repos.length === 0 ? (
                <div className="border-2 border-dashed border-neutral-300 p-12 text-center">
                  <p className="text-neutral-500 font-normal">
                    {searchQuery ? "No repositories found matching your search." : "No repositories found."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {repos.map((repo) => (
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
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-neutral-900">{repo.name}</h3>
                            {repo.private && (
                              <span className="px-2 py-0.5 text-xs border border-neutral-300 text-neutral-600 font-normal">
                                Private
                              </span>
                            )}
                            {repo.language && (
                              <span className="px-2 py-0.5 text-xs bg-neutral-100 text-neutral-600 font-normal">
                                {repo.language}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 font-normal">{repo.full_name}</p>
                          {repo.description && (
                            <p className="text-sm text-neutral-600 font-normal">{repo.description}</p>
                          )}
                        </div>
                        <div
                          className={`w-5 h-5 border flex items-center justify-center transition-all flex-shrink-0 ${
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
              )}

              <Button
                size="lg"
                className="w-full bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-normal tracking-wide border-none shadow-none"
                disabled={selectedRepos.length === 0 || isCreatingProject}
                onClick={handleContinueWithRepos}
              >
                {isCreatingProject ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating project...
                  </span>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Sandbox Creation */}
        {step === 2 && (
          <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 animate-fade-in">
            <div className="text-center space-y-12 max-w-lg">
              <Loader2 className="h-16 w-16 mx-auto animate-spin text-neutral-400" strokeWidth={1} />
              <div className="space-y-6">
                <h3 className="text-2xl font-normal tracking-[0.2em] text-neutral-900 font-[var(--font-inter)]">
                  WAKE UP KAPIN
                </h3>
                <div className="space-y-3">
                  {agentMessages.length === 0 ? (
                    <p className="text-sm font-normal text-neutral-500">
                      Initializing...
                    </p>
                  ) : (
                    agentMessages.map((message, idx) => (
                      <p
                        key={idx}
                        className="text-sm font-normal text-neutral-500"
                      >
                        {message}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Product Metrics Results */}
        {step === 3 && (
          <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 animate-fade-in">
            <div className="w-full max-w-2xl space-y-8 py-12">
              <p className="text-center text-sm font-normal text-neutral-500">
                KAPIN discovered {metrics.length} potential metrics for your project
              </p>

              <div className="space-y-4">
                {metrics.map((metric) => (
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

                        {/* Instrumentation Guide (inline) */}
                        <div className="space-y-4 pt-4 border-t border-neutral-200">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900">How to Apply</h4>

                          <div className="border border-neutral-200 bg-neutral-50">
                            <div className="p-4 border-b border-neutral-200">
                              <h5 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Database Migration</h5>
                            </div>
                            <div className="p-4 space-y-3">
                              <p className="text-xs font-normal text-neutral-600">
                                Add a column to track onboarding progress:
                              </p>
                              <pre className="bg-white p-3 text-xs font-normal text-neutral-700 overflow-x-auto border border-neutral-200">
{`ALTER TABLE users
ADD COLUMN onboarding_step INTEGER DEFAULT 0;`}
                              </pre>
                            </div>
                          </div>

                          <div className="border border-neutral-200 bg-neutral-50">
                            <div className="p-4 border-b border-neutral-200">
                              <h5 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Code Instrumentation</h5>
                            </div>
                            <div className="p-4 space-y-3">
                              <p className="text-xs font-normal text-neutral-600">
                                Add this code to track onboarding progress:
                              </p>
                              <pre className="bg-white p-3 text-xs font-normal text-neutral-700 overflow-x-auto border border-neutral-200">
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
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                className="w-full bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-normal tracking-wide border-none shadow-none"
                onClick={handleCompleteOnboarding}
                disabled={isCompletingOnboarding}
              >
                {isCompletingOnboarding ? "Completando..." : "Listo"}
              </Button>
            </div>
          </div>
        )}
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
