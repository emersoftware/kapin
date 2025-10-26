import { auth } from "@/lib/auth/config";
import { GitHubClient } from "@/lib/github/client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();
    console.log("[DEBUG] Session:", { userId: session?.user?.id, email: session?.user?.email });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("per_page") || "30");

    // Create GitHub client for user
    const githubClient = await GitHubClient.forUser(session.user.id);
    console.log("[DEBUG] GitHub client created:", !!githubClient);

    if (!githubClient) {
      return NextResponse.json(
        { error: "GitHub integration not found" },
        { status: 404 }
      );
    }

    // List repositories
    const result = await githubClient.listRepositories(page, perPage);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error listing GitHub repositories:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
