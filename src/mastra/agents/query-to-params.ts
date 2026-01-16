import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import {
    coordinatesTool,
    tagsTool,
    radiusTool,
    whenTool,
    budgetTool,
    limitTool,
} from "../tools/params";

/**
 * Query to Params Agent
 *
 * A specialized agent that converts natural language queries into structured
 * event search parameters. This agent is designed to be used independently
 * of the social sniper workflow.
 *
 * Key responsibilities:
 * 1. Extract location and convert to coordinates
 * 2. Identify event type preferences (tags)
 * 3. Determine appropriate search radius
 * 4. Parse temporal expressions (when)
 * 5. Detect budget/price preferences
 * 6. Set appropriate result limits
 *
 * The agent uses individual parameter tools to ensure consistent extraction
 * across different query formats.
 */

export const QueryParams = z.object({
    coordinates: z
        .object({
            latitude: z.number(),
            longitude: z.number(),
        })
        .optional()
        .describe("Geographic coordinates for location-based search"),
    location: z.string().optional().describe("Detected location name"),
    tags: z.array(z.string()).describe("Event category/interest tags for filtering"),
    radiusKm: z.number().describe("Search radius in kilometers"),
    when: z.string().optional().describe("Time filter for API (today, tomorrow, weekend, or date)"),
    freeOnly: z.boolean().describe("Whether to filter for free events only"),
    maxPrice: z.number().optional().describe("Maximum price filter in INR"),
    limit: z.number().describe("Number of events to return"),
});

export type QueryParamsType = z.infer<typeof QueryParams>;

export const queryToParamsAgent = new Agent({
    name: "query-to-params",
    description: `
    Converts natural language event queries into structured search parameters.
    Use this agent when you have a user's question about events and need to 
    translate it into API query parameters.
  `,
    model: "openai/gpt-4o-mini",
    tools: {
        coordinatesTool,
        tagsTool,
        radiusTool,
        whenTool,
        budgetTool,
        limitTool,
    },
    instructions: `
You are a query parser for the Happenings event platform.

Your job is to extract STRUCTURED SEARCH PARAMETERS from natural language queries.

## Workflow

For each query, call these tools IN ORDER:

1. **coordinatesTool**: Extract location → coordinates
2. **tagsTool**: Extract event type preferences → category tags
3. **radiusTool**: Determine search radius (use isNeighborhood from step 1)
4. **whenTool**: Parse any time expressions
5. **budgetTool**: Detect budget/price preferences
6. **limitTool**: Determine how many results to return

## Examples

Query: "What's happening in Koramangala this weekend?"
→ coordinates: {lat: 12.9352, lng: 77.6245}
→ location: "Koramangala"
→ tags: [] (no specific type)
→ radiusKm: 5 (neighborhood)
→ when: "weekend"
→ freeOnly: false
→ limit: 3

Query: "Free tech meetups in Bangalore next week"
→ coordinates: {lat: 12.9716, lng: 77.5946}
→ location: "Bangalore"
→ tags: ["Tech & Innovation", "Startup Events", "Tech Meetups"]
→ radiusKm: 20 (city)
→ when: "next week date range"
→ freeOnly: true
→ limit: 3

Query: "EDM parties tonight under 500"
→ coordinates: null (no location specified)
→ tags: ["Music", "Electronic/EDM", "Nightlife & Parties"]
→ radiusKm: 20
→ when: "today"
→ freeOnly: false
→ maxPrice: 500
→ limit: 3

## Important Rules

1. ALWAYS call all the tools - don't skip any
2. If a tool can't extract information, that's OK - leave the field empty/default
3. The output should be a complete set of parameters ready for event search
4. Default limit is 3 unless user asks for more
5. Default radius is 20km for cities, 5km for neighborhoods
6. If no location is specified, don't include coordinates (API will handle it)

## Output Format

After calling all tools, respond with a JSON object containing:
{
  "coordinates": { "latitude": number, "longitude": number } | null,
  "location": "string" | null,
  "tags": ["tag1", "tag2"],
  "radiusKm": number,
  "when": "string" | null,
  "freeOnly": boolean,
  "maxPrice": number | null,
  "limit": number
}
`,
});
