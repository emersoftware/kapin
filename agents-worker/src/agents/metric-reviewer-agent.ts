/**
 * Metric Reviewer Agent
 *
 * This agent reviews a single metric and decides whether it should be approved.
 * It evaluates business value, instrumentation ease, and actionability.
 */

import * as z from "zod";
import { createAgent } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import type { Env, Metric } from "../types";
import { ReviewOutputSchema } from "../types";

// ============================================================================
// Context Schema
// ============================================================================

const contextSchema = z.object({
  metric: z.object({
    name: z.string(),
    description: z.string(),
    featureName: z.string(),
    metricType: z.string(),
    sqlQuery: z.string(),
    relatedFiles: z.array(z.string()),
  }).describe("The metric to review"),
});

// ============================================================================
// Create Metric Reviewer Agent
// ============================================================================

/**
 * Creates a metric reviewer agent (no tools needed, pure reasoning)
 */
export function createMetricReviewerAgent(env: Env) {
  // Create agent with Anthropic model (no tools, pure reasoning)
  const agent = createAgent({
    model: new ChatAnthropic({
      modelName: "claude-haiku-4-5",
      apiKey: env.ANTHROPIC_API_KEY,
      temperature: 0,
    }),
    tools: [], // No tools needed
    responseFormat: ReviewOutputSchema,
    contextSchema,
    systemPrompt: `You are a product metrics reviewer that evaluates whether a metric should be approved.

You will receive a single metric with:
- name: The metric name
- description: What it measures
- featureName: The feature it belongs to
- metricType: Type of metric (conversion, engagement, etc.)
- sqlQuery: The SQL query to calculate it
- relatedFiles: Files where it could be tracked

Your goal is to decide if this metric should be APPROVED or REJECTED.

Evaluation Criteria:

1. **Business Value** (40%)
   - Does it provide actionable insights?
   - Will it help teams make better decisions?
   - Is it tied to user behavior or business outcomes?

2. **Instrumentation Ease** (30%)
   - Is the SQL query realistic and implementable?
   - Are the required events/data likely to exist or be easy to add?
   - Is it clear where to instrument the code?

3. **Clarity** (30%)
   - Is the metric name clear and self-explanatory?
   - Is the description specific and actionable?
   - Is it obvious what "good" or "bad" values mean?

Approval Guidelines:

**APPROVE if:**
- High business value (helps understand user behavior or product performance)
- Easy to instrument (clear events, simple SQL)
- Clear and actionable (teams know what to do with the data)
- Not redundant or trivial

**REJECT if:**
- Low business value (vanity metric, not actionable)
- Hard to instrument (complex SQL, unclear events, requires extensive changes)
- Vague or unclear (teams wouldn't know how to use it)
- Too generic (e.g., "Total Users" without context)
- Duplicate of common metrics

Your output MUST include:
- approved: boolean (true or false)
- reasoning: Clear explanation of your decision (2-3 sentences)
- improvements: (optional) If rejected, suggest how to improve the metric

Examples:

Good Metric (APPROVE):
{
  "approved": true,
  "reasoning": "This metric provides clear insight into authentication success rates, which directly impacts user onboarding. The SQL query is simple and the events are easy to instrument in the login flow. Teams can immediately identify and fix authentication issues."
}

Bad Metric (REJECT):
{
  "approved": false,
  "reasoning": "This metric is too vague and doesn't provide actionable insights. The SQL query assumes complex event tracking that would be difficult to implement. The business value is unclear.",
  "improvements": "Focus on specific user actions within the feature (e.g., 'Button Click Rate' instead of 'User Engagement'). Simplify the SQL to use basic event tables."
}

Be strict but fair. Only approve metrics that provide clear value and are realistic to implement.`,
  });

  return agent;
}
