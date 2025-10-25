import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import OnboardingFlow from "./OnboardingFlow";

export default async function Home() {
  const session = await auth();

  // If user is logged in, check their onboarding step
  if (session?.user) {
    const onboardingStep = session.user.onboardingStep ?? 0;

    // If onboarding is complete (step >= 4), redirect to projects page
    if (onboardingStep >= 4) {
      redirect("/projects");
    }

    // Pass the onboarding step to the client component
    return <OnboardingFlow initialStep={onboardingStep} userId={session.user.id} />;
  }

  // If not logged in, show step 0 (landing + auth)
  return <OnboardingFlow initialStep={0} />;
}
