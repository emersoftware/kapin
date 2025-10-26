import { auth } from "@/lib/auth/config";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, runs, orgMembers, integrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST /api/projects/[id]/run - Create and start a new run for this project
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Get project with repos
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      with: {
        projectRepos: {
          with: {
            repo: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify user has access to this project (via org)
    const userOrg = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });

    if (!userOrg || userOrg.orgId !== project.orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get GitHub token
    const integration = await db.query.integrations.findFirst({
      where: eq(integrations.userId, session.user.id),
    });

    const githubToken = integration?.accessToken;

    // Create new run
    const [run] = await db
      .insert(runs)
      .values({
        projectId,
        status: "pending",
      })
      .returning();

    // Prepare repos for agent
    const reposForAgent = project.projectRepos.map((pr) => ({
      id: pr.repo.githubRepoId,
      name: pr.repo.name,
      clone_url: pr.repo.cloneUrl,
    }));

    // Call agents-worker to start the run
    const agentsWorkerUrl = process.env.AGENTS_WORKER_URL || "http://localhost:8788";
    const startRunResponse = await fetch(`${agentsWorkerUrl}/api/runs/${run.id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        repos: reposForAgent,
        githubToken,
      }),
    });

    if (!startRunResponse.ok) {
      console.error("Failed to start agent run");
      // Update run status to failed
      await db
        .update(runs)
        .set({ status: "failed" })
        .where(eq(runs.id, run.id));

      return NextResponse.json(
        { error: "Failed to start agent run" },
        { status: 500 }
      );
    }

    // Update run status to running
    await db
      .update(runs)
      .set({ status: "running" })
      .where(eq(runs.id, run.id));

    return NextResponse.json({
      success: true,
      runId: run.id,
    });
  } catch (error) {
    console.error("Error creating run:", error);
    return NextResponse.json(
      { error: "Failed to create run" },
      { status: 500 }
    );
  }
}
