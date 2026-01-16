import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Limit Tool
 *
 * Determines the appropriate number of events to return based on context.
 * Generally returns 3 for recommendations, but can adjust based on user request.
 */

const LIMIT_PATTERNS: Array<{
    patterns: RegExp[];
    limit: number;
    reasoning: string;
}> = [
        // Explicit number requests
        {
            patterns: [/\btop\s*(\d+)\b/i, /\b(\d+)\s*best\b/i, /\b(\d+)\s*events?\b/i],
            limit: -1, // Will extract from match
            reasoning: "User requested specific number",
        },
        // "Just one" or "the best"
        {
            patterns: [/\bjust\s*one\b/i, /\bthe\s*best\b/i, /\bsingle\b/i, /\bone\s*event\b/i],
            limit: 1,
            reasoning: "User wants just one recommendation",
        },
        // "A few"
        {
            patterns: [/\ba\s*few\b/i, /\bsome\b/i, /\bcouple\b/i],
            limit: 3,
            reasoning: "User wants a small selection",
        },
        // "Many" or "lots"
        {
            patterns: [/\bmany\b/i, /\blots?\s*of\b/i, /\bseveral\b/i, /\ball\b/i],
            limit: 10,
            reasoning: "User wants more options",
        },
    ];

export const limitTool = createTool({
    id: "limit",
    description: `
    Determines how many events to return based on user query.
    
    Default: 3 (standard recommendation count)
    
    Adjusts based on:
    - Explicit requests: "top 5 events" → 5
    - Context clues: "just one suggestion" → 1
    - "A few options" → 3
    - "Show me all" → 10
    
    Examples:
    - "suggest some events" → 3
    - "top 5 concerts" → 5
    - "what's the best thing to do" → 1
    - "show me all tech meetups" → 10
  `,
    inputSchema: z.object({
        query: z.string().describe("The user's query to analyze for quantity preferences"),
        defaultLimit: z.number().default(3).describe("Default limit if none detected"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        limit: z.number().describe("Number of events to return"),
        reasoning: z.string().optional(),
    }),
    execute: async ({ context }) => {
        const { query, defaultLimit = 3 } = context;

        // Check for explicit number in query
        const explicitMatch =
            query.match(/\btop\s*(\d+)\b/i) ||
            query.match(/\b(\d+)\s*(?:best|events?|options?|suggestions?)\b/i) ||
            query.match(/\bgive\s*(?:me\s*)?(\d+)\b/i) ||
            query.match(/\bshow\s*(?:me\s*)?(\d+)\b/i);

        if (explicitMatch) {
            const limit = parseInt(explicitMatch[1], 10);
            return {
                success: true,
                limit: Math.min(Math.max(limit, 1), 20), // Clamp between 1 and 20
                reasoning: `User requested ${limit} results`,
            };
        }

        // Check patterns
        for (const pattern of LIMIT_PATTERNS) {
            for (const regex of pattern.patterns) {
                if (regex.test(query)) {
                    if (pattern.limit === -1) continue; // Skip explicit number patterns
                    return {
                        success: true,
                        limit: pattern.limit,
                        reasoning: pattern.reasoning,
                    };
                }
            }
        }

        // Default
        return {
            success: true,
            limit: defaultLimit,
            reasoning: `Using default limit of ${defaultLimit} recommendations`,
        };
    },
});
