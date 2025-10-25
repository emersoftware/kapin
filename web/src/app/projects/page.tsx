import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { projects, runs, productMetrics, orgMembers } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export default async function ProjectsPage() {
  const session = await auth();

  // If not logged in, redirect to home
  if (!session?.user?.id) {
    redirect("/");
  }

  // If onboarding not complete, redirect to home
  if ((session.user.onboardingStep ?? 0) < 4) {
    redirect("/");
  }

  // Get user's organization
  const userOrg = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, session.user.id),
    with: {
      org: {
        with: {
          projects: {
            with: {
              runs: {
                orderBy: desc(runs.startedAt),
                limit: 1,
                with: {
                  productMetrics: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const userProjects = userOrg?.org?.projects || [];

  return (
    <div className="min-h-screen bg-[#FAFAF9] font-[var(--font-noto-sans-jp)]">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-block p-3 border-2 border-neutral-300 mb-4">
                <span className="text-2xl font-bold text-neutral-900">K</span>
              </div>
              <h1 className="text-3xl font-bold tracking-[0.2em] text-neutral-900 font-[var(--font-inter)]">
                KAPIN
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <img
                src={session.user.image || ""}
                alt={session.user.name || ""}
                className="w-10 h-10 rounded-full border-2 border-neutral-300"
              />
              <div>
                <p className="font-semibold text-neutral-900">{session.user.name}</p>
                <p className="text-xs text-neutral-500">{session.user.email}</p>
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
            <button className="px-4 py-2 bg-[#7AC74F] hover:bg-[#6AB73F] text-neutral-900 font-normal tracking-wide border-none">
              New Project
            </button>
          </div>

          {userProjects.length === 0 ? (
            <div className="border-2 border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500 font-normal">
                No projects yet. Create your first project to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {userProjects.map((project) => {
                const latestRun = project.runs?.[0];
                const metricsCount = latestRun?.productMetrics?.length || 0;

                return (
                  <div
                    key={project.id}
                    className="border border-neutral-200 bg-white p-6 hover:border-neutral-300 transition-all cursor-pointer"
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
                                className={`px-2 py-1 text-xs border font-normal ${
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
    </div>
  );
}
