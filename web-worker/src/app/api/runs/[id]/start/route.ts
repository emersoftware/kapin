import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { runs, projects, orgMembers, repos, projectRepos, integrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: runId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get run and verify access
    const run = await db.query.runs.findFirst({
      where: eq(runs.id, runId),
      with: {
        project: {
          with: {
            projectRepos: {
              with: {
                repo: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Verify user has access to this project's org
    const userOrg = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });

    if (!userOrg || userOrg.orgId !== run.project.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update run status to "running"
    await db
      .update(runs)
      .set({ status: "running" })
      .where(eq(runs.id, runId));

    // Get GitHub token for cloning private repos
    const userIntegration = await db.query.integrations.findFirst({
      where: eq(integrations.userId, session.user.id),
    });

    const githubToken = userIntegration?.accessToken || undefined;

    // Prepare repos data for agents-worker
    const reposData = run.project.projectRepos.map((pr) => ({
      id: pr.repo.id,
      name: pr.repo.name,
      full_name: pr.repo.fullName,
      clone_url: pr.repo.cloneUrl,
    }));

    // Call agents-worker via HTTP
    try {
      const agentsWorkerUrl = process.env.AGENTS_WORKER_URL || "http://localhost:8788";
      const agentsWorkerResponse = await fetch(`${agentsWorkerUrl}/api/runs/${runId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runId: run.id,
          projectId: run.projectId,
          repos: reposData,
          githubToken,
        }),
      });

      if (!agentsWorkerResponse.ok) {
        throw new Error(`Agents worker returned ${agentsWorkerResponse.status}`);
      }
    } catch (error) {
      console.error("Error calling agents-worker:", error);
      // Update run status to "failed"
      await db
        .update(runs)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(runs.id, runId));

      return NextResponse.json(
        { error: "Failed to start agent" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error starting run:", error);
    return NextResponse.json(
      { error: "Failed to start run" },
      { status: 500 }
    );
  }
}
