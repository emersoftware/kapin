import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { projects, orgMembers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's org
    const userOrg = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });

    if (!userOrg) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get most recent project for this org
    const latestProject = await db.query.projects.findFirst({
      where: eq(projects.orgId, userOrg.orgId),
      orderBy: [desc(projects.createdAt)],
    });

    if (!latestProject) {
      return NextResponse.json({ error: "No project found" }, { status: 404 });
    }

    return NextResponse.json({ projectId: latestProject.id });
  } catch (error) {
    console.error("Error fetching latest project:", error);
    return NextResponse.json(
      { error: "Failed to fetch latest project" },
      { status: 500 }
    );
  }
}
