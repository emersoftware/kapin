import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { productMetrics, runs, projects, orgMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
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
        project: true,
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

    // Get metrics for this run
    const metrics = await db.query.productMetrics.findMany({
      where: eq(productMetrics.runId, runId),
    });

    // Format metrics to match frontend expectations
    const formattedMetrics = metrics.map(metric => ({
      id: metric.id,
      title: metric.title,
      description: metric.description,
      featureName: metric.featureName,
      metricType: metric.metricType,
      sqlQuery: metric.sqlQuery,
      metadata: metric.metadata || {},
    }));

    return NextResponse.json({
      metrics: formattedMetrics,
      runId: runId,
      status: run.status
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
