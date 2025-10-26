import * as z from "zod";
import type { Fetcher } from '@cloudflare/workers-types';

// Cloudflare Environment bindings
export type Env = {
  SANDBOX_WORKER: Fetcher;
  WEB_WORKER: Fetcher;
  ANTHROPIC_API_KEY: string;
  // LangSmith tracing (optional)
  LANGSMITH_TRACING?: string;
  LANGSMITH_ENDPOINT?: string;
  LANGSMITH_API_KEY?: string;
  LANGSMITH_PROJECT?: string;
};

// Request to start a run
export type RunStartRequest = {
  runId: string;
  projectId: string;
  repos: Repository[];
};

export type Repository = {
  id: string;
  name: string;
  clone_url: string;
};

// ============================================================================
// Structured Output Schemas
// ============================================================================

// Feature schema (output from Feature Detector Agent)
export const FeatureSchema = z.object({
  name: z.string().describe("Feature name (e.g., 'Authentication', 'Payments')"),
  description: z.string().describe("What this feature does"),
  relevantFiles: z.array(z.string()).describe("Key files for this feature (relative paths)"),
});

export const FeaturesOutputSchema = z.object({
  features: z.array(FeatureSchema).max(5).describe("Detected features (maximum 5)"),
});

export type Feature = z.infer<typeof FeatureSchema>;

// Metric schema (output from Metric Generator Agent)
export const MetricSchema = z.object({
  title: z.string().describe("Concise metric name"),
  description: z.string().describe("What it measures and why it matters"),
  feature_name: z.string().describe("Feature this metric belongs to"),
  metric_type: z.enum(["conversion", "frequency", "engagement", "retention", "performance"]).describe("Type of metric"),
  sql_query: z.string().describe("Approximate SQL query to calculate this metric"),
  metadata: z.record(z.unknown()).optional().describe("Additional context (importance, frequency, etc.)"),
});

export const MetricsOutputSchema = z.object({
  metrics: z.array(MetricSchema).describe("Generated product metrics"),
});

export type ProductMetric = z.infer<typeof MetricSchema>;

// Review schema (output from Metric Reviewer Agent)
export const ReviewSchema = z.object({
  approved: z.boolean().describe("Whether this metric passes review"),
  reasoning: z.string().describe("Why this metric was approved or rejected"),
  improvements: z.string().optional().describe("Suggestions for improvement if rejected"),
});

export const MetricsReviewOutputSchema = z.object({
  reviews: z.array(ReviewSchema).describe("Review result for each metric"),
});

export type MetricReview = z.infer<typeof ReviewSchema>;

// ============================================================================
// Graph State
// ============================================================================

export type GraphState = {
  runId: string;
  projectId: string;
  repos: Repository[];
  githubToken?: string;
  sandboxReady: boolean;
  features: Feature[];
  allMetrics: ProductMetric[];
  errors: string[];
};
