import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Budget Extraction Tool
 *
 * Detects budget/price preferences from user queries.
 * Distinguishes between:
 * - Free events only
 * - Budget-conscious (looking for affordable options)
 * - Premium experiences
 * - Specific price mentions
 */

/**
 * Budget patterns to match
 */
const BUDGET_PATTERNS: Array<{
    patterns: RegExp[];
    type: "free" | "budget" | "premium" | "any";
    maxPrice?: number;
    reasoning: string;
}> = [
        // Free events
        {
            patterns: [/\bfree\b/i, /\bno\s*cost\b/i, /\bno\s*charge\b/i, /\bzero\s*(?:cost|price)\b/i],
            type: "free",
            maxPrice: 0,
            reasoning: "Looking for free events only",
        },
        // Budget-conscious
        {
            patterns: [
                /\bcheap\b/i,
                /\bbudget\b/i,
                /\baffordable\b/i,
                /\binexpensive\b/i,
                /\blow\s*cost\b/i,
                /\bunder\s*\d+/i,
                /\bless\s*than\s*\d+/i,
            ],
            type: "budget",
            maxPrice: 500, // ₹500 default budget threshold
            reasoning: "Looking for affordable/budget options",
        },
        // Premium experiences
        {
            patterns: [
                /\bpremium\b/i,
                /\bluxury\b/i,
                /\bhigh[\s-]*end\b/i,
                /\bexclusive\b/i,
                /\bfancy\b/i,
                /\bupscale\b/i,
                /\bfine\s*dining\b/i,
            ],
            type: "premium",
            reasoning: "Looking for premium/luxury experiences",
        },
        // Student/broke indicators
        {
            patterns: [/\bstudent\b/i, /\bcollege\b/i, /\bbroke\b/i, /\btight\s*budget\b/i],
            type: "budget",
            maxPrice: 300, // Lower threshold for students
            reasoning: "Student/budget-conscious user",
        },
    ];

export const budgetTool = createTool({
    id: "budget",
    description: `
    Detects budget and price preferences from user query.
    
    Returns:
    - "free" → Only free events
    - "budget" → Affordable options (under ₹500)
    - "premium" → High-end experiences
    - "any" → No price preference
    
    Also extracts specific price limits if mentioned (e.g., "under ₹1000")
    
    Examples:
    - "free events this weekend" → { type: "free", maxPrice: 0 }
    - "cheap things to do" → { type: "budget", maxPrice: 500 }
    - "luxury date night" → { type: "premium" }
    - "events under 500" → { type: "budget", maxPrice: 500 }
  `,
    inputSchema: z.object({
        query: z.string().describe("The user's query to analyze for budget preferences"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        budget: z
            .object({
                type: z.enum(["free", "budget", "premium", "any"]),
                maxPrice: z.number().optional().describe("Maximum price in INR if applicable"),
                freeOnly: z.boolean().describe("Whether to filter for free events only"),
            })
            .optional(),
        detected: z.boolean().describe("Whether a budget preference was detected"),
        reasoning: z.string().optional(),
        error: z.string().optional(),
    }),
    execute: async ({ context }) => {
        const { query } = context;

        try {
            // Check for explicit price mentions first
            const priceMatch =
                query.match(/under\s*₹?\s*(\d+)/i) ||
                query.match(/less\s*than\s*₹?\s*(\d+)/i) ||
                query.match(/below\s*₹?\s*(\d+)/i) ||
                query.match(/max(?:imum)?\s*₹?\s*(\d+)/i) ||
                query.match(/budget\s*(?:of|is)?\s*₹?\s*(\d+)/i);

            if (priceMatch) {
                const maxPrice = parseInt(priceMatch[1], 10);
                const budgetType = maxPrice === 0 ? "free" as const : "budget" as const;
                return {
                    success: true,
                    budget: {
                        type: budgetType,
                        maxPrice,
                        freeOnly: maxPrice === 0,
                    },
                    detected: true,
                    reasoning: `Explicit price limit: ₹${maxPrice}`,
                };
            }

            // Check budget patterns
            for (const pattern of BUDGET_PATTERNS) {
                for (const regex of pattern.patterns) {
                    if (regex.test(query)) {
                        return {
                            success: true,
                            budget: {
                                type: pattern.type,
                                maxPrice: pattern.maxPrice,
                                freeOnly: pattern.type === "free",
                            },
                            detected: true,
                            reasoning: pattern.reasoning,
                        };
                    }
                }
            }

            // No budget preference detected
            return {
                success: true,
                budget: {
                    type: "any" as const,
                    freeOnly: false,
                },
                detected: false,
                reasoning: "No specific budget preference detected",
            };
        } catch (error) {
            return {
                success: false,
                detected: false,
                error: error instanceof Error ? error.message : "Unknown error detecting budget",
            };
        }
    },
});

/**
 * Free Events Tool (specialized)
 *
 * Simple boolean check for free events filter.
 * For use when you just need to know if user wants free events.
 */
export const freeTool = createTool({
    id: "free",
    description: `
    Checks if user is specifically looking for free events.
    
    Returns a simple boolean for event filtering.
    
    Examples:
    - "free events in Bangalore" → true
    - "no cost activities" → true
    - "events this weekend" → false (no free requirement)
  `,
    inputSchema: z.object({
        query: z.string().describe("The user's query to check for free event preference"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        wantsFreeEvents: z.boolean().describe("Whether user specifically wants free events"),
        reasoning: z.string().optional(),
    }),
    execute: async ({ context }) => {
        const { query } = context;

        const freePatterns = [
            /\bfree\b/i,
            /\bno\s*cost\b/i,
            /\bno\s*charge\b/i,
            /\bzero\s*(?:cost|price)\b/i,
            /\bfree\s*(?:events?|activities?|things?)\b/i,
        ];

        const wantsFreeEvents = freePatterns.some((pattern) => pattern.test(query));

        return {
            success: true,
            wantsFreeEvents,
            reasoning: wantsFreeEvents
                ? "User explicitly requested free events"
                : "No free event preference detected",
        };
    },
});
