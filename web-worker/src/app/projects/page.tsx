"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Search, Loader2 } from "lucide-react";

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  runs: Array<{
    id: string;
    status: string;
    startedAt: Date;
    productMetrics: Array<unknown>;
  }>;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  language?: string | null;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Set mounted state
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Redirect if not logged in or onboarding incomplete
  useEffect(() => {
    if (!isMounted) return;
    if (status === "loading") return;

    if (!session) {
      router.push("/");
      return;
    }

    const onboardingStep = (session.user as { onboardingStep?: number }).onboardingStep ?? 0;
    if (onboardingStep < 4) {
      router.push("/");
    }
  }, [session, status, router, isMounted]);

  // Load projects
  useEffect(() => {
    if (!isMounted) return;
    if (status === "loading" || !session) return;

    const fetchProjects = async () => {
      try {
        const response = await fetch("/api/projects");
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects || []);
        }
      } catch (error) {
        console.error("Error loading projects:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [session, status, isMounted]);

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

  // Search debounce
  useEffect(() => {
    if (!isModalOpen) return;

    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchRepositories(searchQuery);
      } else {
        loadRepositories();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, isModalOpen]);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setSelectedRepos([]);
    setSearchQuery("");
    loadRepositories();
  };

  const toggleRepo = (id: number) => {
    setSelectedRepos(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleAddProject = async (andRun: boolean = false) => {
    if (selectedRepos.length === 0) return;

    setIsCreatingProject(true);
    try {
      const selectedRepoNames = repos
        .filter((r) => selectedRepos.includes(r.id))
        .map((repo) => repo.name);

      const projectName = selectedRepoNames.length === 1
        ? selectedRepoNames[0]
        : `${selectedRepoNames[0]} and ${selectedRepoNames.length - 1} other${selectedRepoNames.length > 2 ? "s" : ""}`;

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          repoIds: selectedRepos,
          startRun: andRun,
        }),
      });

      if (response.ok) {
        const { projectId } = await response.json();
        setIsModalOpen(false);
        router.push(`/projects/${projectId}`);
      } else {
        console.error("Failed to create project");
      }
    } catch (error) {
      console.error("Error creating project:", error);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove project from list
        setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
        setIsDeleteModalOpen(false);
        setProjectToDelete(null);
      } else {
        console.error("Failed to delete project");
        alert("Failed to delete project. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("An error occurred while deleting the project.");
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteModal = (project: Project) => {
    setProjectToDelete(project);
    setIsDeleteModalOpen(true);
  };

  // Show loading during mount or auth check
  if (!isMounted || status === "loading" || !session) {
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
              <h1 className="text-3xl font-bold tracking-[0.2em] text-neutral-900 font-[var(--font-inter)]">
                KAPIN
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <img
                src={session.user?.image || ""}
                alt={session.user?.name || ""}
                className="w-10 h-10 rounded-full border-2 border-neutral-300"
              />
              <div>
                <p className="font-semibold text-neutral-900">{session.user?.name}</p>
                <p className="text-xs text-neutral-500">{session.user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-[0.3em] text-neutral-700 uppercase">
              Your Projects
            </h2>
            <button
              onClick={handleOpenModal}
              className="px-6 py-3 bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-normal tracking-wide border-2 border-neutral-900 rounded-lg transition-all hover:border-[#6AB73F]"
            >
              New Project
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
            </div>
          ) : projects.length === 0 ? (
            <div className="border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center">
              <p className="text-neutral-500 font-normal">
                No projects yet. Create your first project to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => {
                const latestRun = project.runs?.[0];
                const metricsCount = latestRun?.productMetrics?.length || 0;

                return (
                  <div
                    key={project.id}
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="border border-neutral-200 bg-white rounded-lg p-6 hover:border-neutral-300 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <h3 className="font-semibold text-lg text-neutral-900">
                            {project.name}
                          </h3>
                          {project.description && (
                            <p className="text-sm text-neutral-600 font-normal">
                              {project.description}
                            </p>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuItem
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteModal(project);
                            }}
                          >
                            Delete Project
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </div>

                      <div className="flex items-center gap-6 text-xs text-neutral-500 pt-3 border-t border-neutral-200">
                        <div className="flex items-center gap-2">
                          <span className="font-normal">Latest Run:</span>
                          <span className="font-semibold">
                            {latestRun
                              ? new Date(latestRun.startedAt).toLocaleDateString()
                              : "No runs yet"}
                          </span>
                        </div>
                        {latestRun && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="font-normal">Status:</span>
                              <span
                                className={`px-2 py-1 text-xs border rounded font-normal ${
                                  latestRun.status === "completed"
                                    ? "border-[#7AC74F] bg-[#7AC74F]/10 text-neutral-900"
                                    : latestRun.status === "running"
                                    ? "border-blue-500 bg-blue-50 text-blue-900"
                                    : latestRun.status === "failed"
                                    ? "border-red-500 bg-red-50 text-red-900"
                                    : "border-neutral-300 bg-neutral-50 text-neutral-700"
                                }`}
                              >
                                {latestRun.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-normal">Metrics:</span>
                              <span className="font-semibold">{metricsCount}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Select repositories that belong to the same project
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[60vh]">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search repositories..."
                className="pl-12 border-neutral-300 bg-white font-normal rounded-lg"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {isLoadingRepos || isSearching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400" strokeWidth={1.5} />
              </div>
            ) : repos.length === 0 ? (
              <div className="border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center">
                <p className="text-neutral-500 font-normal">
                  {searchQuery ? "No repositories found matching your search." : "No repositories found."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {repos.map((repo) => (
                  <div
                    key={repo.id}
                    className={`border cursor-pointer transition-all bg-white rounded-lg p-4 ${
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
                            <span className="px-2 py-0.5 text-xs border border-neutral-300 rounded text-neutral-600 font-normal">
                              Private
                            </span>
                          )}
                          {repo.language && (
                            <span className="px-2 py-0.5 text-xs bg-neutral-100 rounded text-neutral-600 font-normal">
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
                        className={`w-5 h-5 border rounded flex items-center justify-center transition-all flex-shrink-0 ${
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
          </div>
        </DialogBody>

        <DialogFooter>
          <button
            onClick={() => setIsModalOpen(false)}
            className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50 font-normal"
          >
            Cancel
          </button>
          <button
            onClick={() => handleAddProject(false)}
            disabled={selectedRepos.length === 0 || isCreatingProject}
            className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-lg font-normal border border-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreatingProject ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </span>
            ) : (
              "Add New Project"
            )}
          </button>
          <button
            onClick={() => handleAddProject(true)}
            disabled={selectedRepos.length === 0 || isCreatingProject}
            className="px-4 py-2 bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 rounded-lg font-normal border-2 border-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreatingProject ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </span>
            ) : (
              "Add and Run"
            )}
          </button>
        </DialogFooter>
      </Dialog>

      {/* Delete Project Modal */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)}>
        <DialogHeader>
          <DialogTitle>Delete Project</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{projectToDelete?.name}&quot;? This action cannot be undone and will delete all runs and metrics associated with this project.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button
            onClick={() => setIsDeleteModalOpen(false)}
            className="px-4 py-2 border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50 font-normal"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteProject}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-normal disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </span>
            ) : (
              "Delete Project"
            )}
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
