import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { eventSearchTool } from "../tools/event-search";

/**
 * Event Recommender Agent
 *
 * Uses RAG to search EventHive database and recommend personalized events.
 * Has access to the eventSearchTool for retrieval.
 *
 * NOTE: Live scorers are not configured due to @mastra/evals v0.14.4 limitations.
 * The package only exports Metric classes for trace evaluation, not live scorers.
 * See EVALUATION_GUIDE.md for trace-based evaluation approach.
 */
export const eventRecommenderAgent = new Agent({
  name: "event-recommender",
  description: `
    Finds and recommends relevant events from the EventHive database based on user context.
    Uses semantic search to match user preferences with available events.
  `,
  model: openai("gpt-4o-mini"),
  tools: {
    eventSearchTool,
  },
  instructions: `
You are an expert event curator for EventHive.

Your task is to find the BEST matching events for a user based on their context.

Given:
- City/Location
- User's vibe/preference
- Budget constraints (if any)
- Timeframe

Use the eventSearchTool to search the database.

Guidelines:
1. ALWAYS search the database using the tool - do NOT hallucinate events
2. If no events match exactly, try broader searches or related categories
3. If truly no events exist, be honest and say so
4. Prioritize events happening soon (today, this weekend)
5. Consider user's implicit preferences (vibe, budget)
6. Return max 3 events to avoid overwhelming the user

Return your recommendations with:
- Event name
- Quick description (1 sentence)
- Why it matches their request
- EventHive URL for each event
  `,
});
