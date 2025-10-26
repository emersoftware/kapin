import { auth } from "@/lib/auth/config";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, runs, productMetrics, orgMembers, repos, projectRepos } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { GitHubClient } from "@/lib/github/client";

// GET /api/projects - List all projects for the authenticated user
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    return NextResponse.json({ projects: userProjects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project with repos, optionally start run
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name: projectName, description: projectDescription, repoIds, startRun = false } = body;

    if (!projectName || projectName.trim() === "") {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    if (!repoIds || repoIds.length === 0) {
      return NextResponse.json(
        { error: "At least one repository must be selected" },
        { status: 400 }
      );
    }

    // Get user's organization
    const userOrg = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: "User organization not found" },
        { status: 404 }
      );
    }

    // Get GitHub client to fetch repo details
    const githubClient = await GitHubClient.forUser(session.user.id);

    if (!githubClient) {
      return NextResponse.json(
        { error: "GitHub integration not found" },
        { status: 404 }
      );
    }

    // Fetch all repos from GitHub
    const githubRepos = await githubClient.listRepositories(1, 100);
    const selectedGithubRepos = githubRepos.repositories.filter((repo) =>
      repoIds.includes(repo.id)
    );

    if (selectedGithubRepos.length === 0) {
      return NextResponse.json(
        { error: "Selected repositories not found" },
        { status: 404 }
      );
    }

    // Create project
    const [project] = await db
      .insert(projects)
      .values({
        orgId: userOrg.orgId,
        name: projectName,
        description: projectDescription || null,
      })
      .returning();

    // Insert repos and link to project
    const repoRecords = [];
    for (const githubRepo of selectedGithubRepos) {
      // Check if repo already exists in our database
      const existingRepo = await db.query.repos.findFirst({
        where: eq(repos.githubRepoId, String(githubRepo.id)),
      });

      let repoId: string;

      if (existingRepo) {
        repoId = existingRepo.id;
      } else {
        // Insert new repo
        const [newRepo] = await db
          .insert(repos)
          .values({
            orgId: userOrg.orgId,
            githubRepoId: String(githubRepo.id),
            name: githubRepo.name,
            fullName: githubRepo.full_name,
            cloneUrl: githubRepo.clone_url,
          })
          .returning();

        repoId = newRepo.id;
      }

      // Link repo to project
      await db.insert(projectRepos).values({
        projectId: project.id,
        repoId: repoId,
      });

      repoRecords.push({
        id: repoId,
        name: githubRepo.name,
        clone_url: githubRepo.clone_url,
      });
    }

    // If startRun is true, create a run (will be started on the project page)
    let runId = null;
    if (startRun) {
      const [run] = await db
        .insert(runs)
        .values({
          projectId: project.id,
          status: "pending",
        })
        .returning();

      runId = run.id;
    }

    return NextResponse.json({
      success: true,
      projectId: project.id,
      runId,
    });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
