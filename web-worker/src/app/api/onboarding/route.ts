import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { step } = await request.json();

    if (typeof step !== "number" || step < 0) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    // Update onboarding step
    await db
      .update(users)
      .set({ onboardingStep: step })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true, step });
  } catch (error) {
    console.error("Error updating onboarding step:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
