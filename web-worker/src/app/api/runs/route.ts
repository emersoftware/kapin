import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { runs, projects, orgMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Verify user has access to this project
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify user is member of project's org
    const userOrg = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });

    if (!userOrg || userOrg.orgId !== project.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Create run with status "pending"
    const [run] = await db
      .insert(runs)
      .values({
        projectId,
        status: "pending",
      })
      .returning();

    return NextResponse.json({ runId: run.id });
  } catch (error) {
    console.error("Error creating run:", error);
    return NextResponse.json(
      { error: "Failed to create run" },
      { status: 500 }
    );
  }
}
