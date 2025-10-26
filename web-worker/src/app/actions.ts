"use server";

import { signIn, signOut, auth } from "@/lib/auth/config";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users, projects, repos, projectRepos, orgMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { GitHubClient } from "@/lib/github/client";

export async function handleGithubSignIn() {
  await signIn("github", { redirectTo: "/" });
}

export async function handleSignOut() {
  await signOut({ redirectTo: "/" });
}

export async function updateOnboardingStep(step: number) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (typeof step !== "number" || step < 0) {
      return { success: false, error: "Invalid step" };
    }

    // Update onboarding step
    await db
      .update(users)
      .set({ onboardingStep: step })
      .where(eq(users.id, session.user.id));

    revalidatePath("/");
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    console.error("Error updating onboarding step:", error);
    return { success: false, error: "Internal server error" };
  }
}

interface CreateProjectWithReposInput {
  projectName: string;
  projectDescription?: string;
  repoIds: number[];
}

export async function createProjectWithRepos(input: CreateProjectWithReposInput) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    const { projectName, projectDescription, repoIds } = input;

    if (!projectName || projectName.trim() === "") {
      return { success: false, error: "Project name is required" };
    }

    if (!repoIds || repoIds.length === 0) {
      return { success: false, error: "At least one repository must be selected" };
    }

    // Get user's organization
    const userOrg = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });

    if (!userOrg) {
      return { success: false, error: "User organization not found" };
    }

    // Get GitHub client to fetch repo details
    const githubClient = await GitHubClient.forUser(session.user.id);

    if (!githubClient) {
      return { success: false, error: "GitHub integration not found" };
    }

    // Fetch all repos from GitHub
    const githubRepos = await githubClient.listRepositories(1, 100);
    const selectedGithubRepos = githubRepos.repositories.filter((repo) =>
      repoIds.includes(repo.id)
    );

    if (selectedGithubRepos.length === 0) {
      return { success: false, error: "Selected repositories not found" };
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
    }

    // Update onboarding step to 2 (sandbox/agent running)
    await db
      .update(users)
      .set({ onboardingStep: 2 })
      .where(eq(users.id, session.user.id));

    revalidatePath("/");
    revalidatePath("/projects");

    return {
      success: true,
      projectId: project.id,
    };
  } catch (error) {
    console.error("Error creating project with repos:", error);
    return { success: false, error: "Internal server error" };
  }
}
