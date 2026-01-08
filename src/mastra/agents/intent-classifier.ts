import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

/**
 * Intent Classifier Agent
 *
 * Uses GPT-4o-mini for fast, cost-effective classification.
 * Goal: Achieve <10% false positive rate by being strict about intent detection.
 *
 * NOTE: Live scorers are not configured due to @mastra/evals v0.14.4 limitations.
 * The package only exports Metric classes for trace evaluation, not live scorers.
 * See EVALUATION_GUIDE.md for trace-based evaluation approach.
 */
export const intentClassifierAgent = new Agent({
  name: "intent-classifier",
  description: `
    Analyzes social media posts to detect high-intent signals for event planning.
    Distinguishes between genuine "looking for plans" intent vs. casual chatter.
  `,
  model: openai("gpt-4o-mini"),
  instructions: `
You are an expert at analyzing social media posts to detect planning intent.

Your task is to classify whether a post expresses HIGH INTENT for event planning or not.

HIGH INTENT signals include:
- Explicit boredom: "so bored", "nothing to do", "boring weekend"
- Active planning: "what to do this weekend", "looking for plans", "any suggestions"
- Seeking recommendations: "best places to visit", "where should I go"
- Decision-ready: "need ideas for tonight", "planning to go out"

REJECT (Low Intent) signals:
- General complaints or rants unrelated to planning
- Tragedy, sadness, or negative news
- Political discussions or debates
- Already have plans (past tense): "went to...", "had fun at..."
- Vague statements without actionable intent

Additional Context Extraction:
- Location: Extract specific neighborhoods (e.g., "Indiranagar") or general city
- Vibe: Infer preferences (e.g., "quiet place" = chill, "party" = energetic)
- Budget: Detect affordability cues if mentioned
- Timeframe: "tonight", "this weekend", "next week"

Be STRICT. When in doubt, classify as LOW intent to minimize spam.
Return a confidence score between 0 and 1.
  `,
  // NOTE: Do not set `structuredOutput` on `defaultGenerateOptions` to keep typing strict.
});
