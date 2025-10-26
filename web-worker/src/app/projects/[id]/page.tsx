"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

export const dynamic = 'force-dynamic';

interface ProductMetric {
  id: string;
  title: string;
  description: string;
  featureName: string;
  metricType: string;
  sqlQuery: string | null;
  metadata: unknown;
  createdAt: Date;
}

interface Run {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  productMetrics: ProductMetric[];
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  runs: Run[];
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());

  // WebSocket state for active run
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<string[]>([]);

  // Set mounted state
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Redirect if not logged in
  useEffect(() => {
    if (!isMounted) return;
    if (status === "loading") return;

    if (!session) {
      router.push("/");
    }
  }, [session, status, router, isMounted]);

  // Load project data
  useEffect(() => {
    if (!isMounted) return;
    if (status === "loading" || !session) return;

    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`);
        if (response.ok) {
          const data = await response.json();
          setProject(data.project);

          // Check if there's an active run
          const activeRun = data.project.runs.find((r: Run) => r.status === "running");
          if (activeRun) {
            setActiveRunId(activeRun.id);
          }
        } else if (response.status === 404) {
          router.push("/projects");
        }
      } catch (error) {
        console.error("Error loading project:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [session, status, projectId, router, isMounted]);

  // WebSocket connection for active run
  useEffect(() => {
    if (!activeRunId) return;

    const isDev = window.location.hostname === "localhost";
    const agentsWorkerUrl = isDev
      ? "ws://localhost:8788"
      : "wss://kapin-agents-worker.e-benjaminsalazarrubilar.workers.dev";
    const wsUrl = `${agentsWorkerUrl}/ws/${activeRunId}`;

    console.log("Connecting to WebSocket for active run:", wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected for run:", activeRunId);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "progress") {
          setAgentMessages((prev) => [...prev, data.message]);
        } else if (data.type === "metrics_generated") {
          console.log("Metrics received:", data.metrics);

          // Update project state with new metrics
          setProject((prev) => {
            if (!prev) return prev;
            const updatedProject = { ...prev };
            const activeRunIndex = updatedProject.runs.findIndex((r) => r.id === activeRunId);

            if (activeRunIndex >= 0) {
              // Agregar las nuevas métricas al run activo
              updatedProject.runs[activeRunIndex].productMetrics = [
                ...updatedProject.runs[activeRunIndex].productMetrics,
                ...data.metrics
              ];
            }

            return updatedProject;
          });
        } else if (data.type === "completed") {
          console.log("Run completed");

          // Update run status
          setProject((prev) => {
            if (!prev) return prev;
            const updatedProject = { ...prev };
            const completedRunIndex = updatedProject.runs.findIndex((r) => r.id === activeRunId);

            if (completedRunIndex >= 0) {
              updatedProject.runs[completedRunIndex].status = "completed";
            }

            return updatedProject;
          });

          setActiveRunId(null);
          setAgentMessages([]);
        } else if (data.type === "error") {
          console.error("Agent error:", data.error);
          setAgentMessages((prev) => [...prev, `Error: ${data.error}`]);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [activeRunId]);

  const handleNewRun = async () => {
    setIsCreatingRun(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/run`, {
        method: "POST",
      });

      if (response.ok) {
        const { runId } = await response.json();
        setActiveRunId(runId);
        setAgentMessages(["Starting agent analysis..."]);

        // Update project state to add the new run
        setProject((prev) => {
          if (!prev) return prev;
          const updatedProject = { ...prev };

          // Add new run at the beginning of runs array
          const newRun = {
            id: runId,
            status: "running",
            startedAt: new Date(),
            completedAt: null,
            productMetrics: []
          };

          updatedProject.runs = [newRun, ...updatedProject.runs];
          return updatedProject;
        });
      } else {
        console.error("Failed to start run");
      }
    } catch (error) {
      console.error("Error starting run:", error);
    } finally {
      setIsCreatingRun(false);
    }
  };

  const toggleRun = (runId: string) => {
    setExpandedRuns((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(runId)) {
        newSet.delete(runId);
      } else {
        newSet.add(runId);
      }
      return newSet;
    });
  };

  const toggleMetric = (metricId: string) => {
    setExpandedMetrics((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(metricId)) {
        newSet.delete(metricId);
      } else {
        newSet.add(metricId);
      }
      return newSet;
    });
  };

  // Show loading during mount, auth check, or data loading
  if (!isMounted || status === "loading" || isLoading || !project) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] font-[var(--font-noto-sans-jp)]">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/kapin-logo.png"
                alt="KAPIN"
                className="w-16 h-16 object-contain"
              />
              <div>
                <h1 className="text-3xl font-bold tracking-[0.2em] text-neutral-900 font-[var(--font-inter)]">
                  KAPIN
                </h1>
                <p className="text-sm text-neutral-500 mt-1">{project.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/projects")}
                className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50 font-normal"
              >
                Back to Projects
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50 font-normal"
              >
                Logout
              </button>
              {session?.user?.image && (
                <img
                  src={session.user.image}
                  alt={session.user.name || ""}
                  className="w-10 h-10 rounded-full border-2 border-neutral-300"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Project Info */}
          <div className="bg-white border border-neutral-200 rounded-lg p-6">
            <h2 className="font-semibold text-lg text-neutral-900">{project.name}</h2>
            {project.description && (
              <p className="text-sm text-neutral-600 font-normal mt-2">{project.description}</p>
            )}
            <div className="mt-4 flex items-center gap-4 text-xs text-neutral-500">
              <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>{project.runs.length} run{project.runs.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Active Run Progress */}
          {activeRunId && agentMessages.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-blue-900">Agent Running...</h3>
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
              <div className="space-y-2">
                {agentMessages.map((message, i) => (
                  <p key={i} className="text-sm text-blue-800 font-normal">
                    {message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* New Run Button */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-[0.3em] text-neutral-700 uppercase">
              Runs
            </h2>
            <button
              onClick={handleNewRun}
              disabled={isCreatingRun || !!activeRunId}
              className="px-6 py-3 bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-normal tracking-wide border-2 border-neutral-900 rounded-lg transition-all hover:border-[#6AB73F] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingRun ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </span>
              ) : (
                "New Run"
              )}
            </button>
          </div>

          {/* Runs List */}
          {project.runs.length === 0 ? (
            <div className="border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center">
              <p className="text-neutral-500 font-normal">
                No runs yet. Start your first run to generate metrics.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {project.runs.map((run) => (
                <div
                  key={run.id}
                  className="border border-neutral-200 bg-white rounded-lg overflow-hidden"
                >
                  {/* Run Header */}
                  <div
                    onClick={() => toggleRun(run.id)}
                    className="p-6 cursor-pointer hover:bg-neutral-50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-4">
                          <h3 className="font-semibold text-neutral-900">
                            {new Date(run.startedAt).toLocaleDateString()} at{" "}
                            {new Date(run.startedAt).toLocaleTimeString()}
                          </h3>
                          <span
                            className={`px-2 py-1 text-xs border rounded font-normal ${
                              run.status === "completed"
                                ? "border-[#7AC74F] bg-[#7AC74F]/10 text-neutral-900"
                                : run.status === "running"
                                ? "border-blue-500 bg-blue-50 text-blue-900"
                                : run.status === "failed"
                                ? "border-red-500 bg-red-50 text-red-900"
                                : "border-neutral-300 bg-neutral-50 text-neutral-700"
                            }`}
                          >
                            {run.status}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 font-normal">
                          {run.productMetrics.length} metric{run.productMetrics.length !== 1 ? "s" : ""} generated
                        </p>
                      </div>
                      <div>
                        {expandedRuns.has(run.id) ? (
                          <ChevronUp className="h-5 w-5 text-neutral-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-neutral-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Run Metrics (Expanded) */}
                  {expandedRuns.has(run.id) && run.productMetrics.length > 0 && (
                    <div className="border-t border-neutral-200 p-6 bg-neutral-50">
                      <div className="space-y-3">
                        {run.productMetrics.map((metric) => (
                          <div
                            key={metric.id}
                            className="bg-white border border-neutral-200 rounded-lg overflow-hidden"
                          >
                            {/* Metric Header */}
                            <div
                              onClick={() => toggleMetric(metric.id)}
                              className="p-4 cursor-pointer hover:bg-neutral-50 transition-all"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-neutral-900">{metric.title}</h4>
                                  <p className="text-sm text-neutral-600 font-normal mt-1 line-clamp-2">
                                    {metric.description}
                                  </p>
                                  <div className="flex items-center gap-3 mt-2">
                                    <span className="px-2 py-0.5 text-xs bg-neutral-100 rounded text-neutral-600">
                                      {metric.featureName}
                                    </span>
                                    <span className="px-2 py-0.5 text-xs bg-neutral-100 rounded text-neutral-600">
                                      {metric.metricType}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  {expandedMetrics.has(metric.id) ? (
                                    <ChevronUp className="h-5 w-5 text-neutral-400" />
                                  ) : (
                                    <ChevronDown className="h-5 w-5 text-neutral-400" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Metric Details (Expanded) */}
                            {expandedMetrics.has(metric.id) && (
                              <div className="border-t border-neutral-200 p-4 bg-neutral-50 space-y-4">
                                <div>
                                  <h5 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">
                                    Description
                                  </h5>
                                  <p className="text-sm text-neutral-600 font-normal">{metric.description}</p>
                                </div>

                                {metric.sqlQuery && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">
                                      SQL Query
                                    </h5>
                                    <pre className="bg-neutral-900 text-green-400 p-3 rounded text-xs overflow-x-auto font-mono">
                                      {metric.sqlQuery}
                                    </pre>
                                  </div>
                                )}

                                {metric.metadata != null && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">
                                      Metadata
                                    </h5>
                                    <pre className="bg-neutral-100 p-3 rounded text-xs overflow-x-auto font-mono">
                                      {JSON.stringify(metric.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
