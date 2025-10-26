import { auth } from "@/lib/auth/config";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, runs, orgMembers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET /api/projects/[id] - Get project details with all runs and metrics
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Get project with runs and metrics
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      with: {
        runs: {
          orderBy: desc(runs.startedAt),
          with: {
            productMetrics: true,
          },
        },
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

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Get project to verify ownership
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
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

    // Delete project (cascade will handle runs, metrics, instrumentations, etc.)
    await db.delete(projects).where(eq(projects.id, projectId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
