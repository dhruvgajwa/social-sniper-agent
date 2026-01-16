import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { INTEREST_CATEGORIES, findMatchingTags } from "../taxonomy";

/**
 * Tags Extraction Tool
 *
 * Analyzes user query to extract relevant event category tags.
 * Maps natural language to the Happenings taxonomy for filtering.
 */

/**
 * Semantic patterns for complex multi-word matching
 * These patterns have priority over simple keyword matching
 */
const SEMANTIC_PATTERNS: Array<{
    patterns: RegExp[];
    primaryCategories: string[];
    secondaryCategories: string[];
    interests: string[];
    confidence: number;
    highPriority?: boolean;
}> = [
        // HIGH PRIORITY - Specific patterns that should always match
        {
            patterns: [/\bedm\b/i, /\belectronic\s*(dance)?\s*(music)?\b/i, /\bdj\s*(night|set|party)\b/i],
            primaryCategories: ["Music"],
            secondaryCategories: ["Nightlife & Parties"],
            interests: ["Electronic/EDM"],
            confidence: 0.95,
            highPriority: true,
        },
        {
            patterns: [/\brunning\b/i, /\bmarathon\b/i, /\b(5k|10k|21k|half\s*marathon)\b/i, /\bfun\s*run\b/i],
            primaryCategories: ["Outdoor & Adventure"],
            secondaryCategories: ["Sports & Fitness"],
            interests: ["Running/Marathons"],
            confidence: 0.95,
            highPriority: true,
        },
        {
            patterns: [/\byoga\b/i, /\bwellness\b/i, /\bmeditation\b/i, /\bmindfulness\b/i],
            primaryCategories: ["Health & Wellness"],
            secondaryCategories: [],
            interests: ["Yoga/Meditation", "Wellness Retreats"],
            confidence: 0.95,
            highPriority: true,
        },
        // Team/group activities
        {
            patterns: [/\bteam\s*(outing|building|activity)\b/i, /\bcorporate\s*(outing|event)\b/i],
            primaryCategories: ["Social & Networking"],
            secondaryCategories: ["Outdoor & Adventure"],
            interests: ["Team Building", "Corporate Events"],
            confidence: 0.9,
            highPriority: true,
        },
        // Party contexts
        {
            patterns: [/\bbachelor(ette)?\s*(party|bash)\b/i, /\bstag\s*(party|night)\b/i],
            primaryCategories: ["Nightlife & Parties", "Social & Networking"],
            secondaryCategories: [],
            interests: ["Club Events", "Bars & Pubs"],
            confidence: 0.9,
            highPriority: true,
        },
        {
            patterns: [/\bbirthday\b/i, /\bbday\b/i],
            primaryCategories: ["Social & Networking", "Entertainment"],
            secondaryCategories: ["Nightlife & Parties"],
            interests: [],
            confidence: 0.85,
            highPriority: true,
        },
        // Watch parties
        {
            patterns: [
                /\b(watch|screening|live\s*screening)\b.*\b(match|game|ipl|cricket|football)\b/i,
                /\b(match|game|ipl|cricket|football)\b.*\b(screening|watch\s*party)\b/i,
                /\b(india\s*vs|ind\s*vs)\b/i,
            ],
            primaryCategories: ["Sports & Fitness", "Entertainment"],
            secondaryCategories: ["Nightlife & Parties"],
            interests: ["Match Screenings", "Watch Parties"],
            confidence: 0.9,
            highPriority: true,
        },
        // Date activities
        {
            patterns: [/\bdate\s*(night|idea|activity)\b/i, /\bromantic\b/i, /\banniversary\b/i],
            primaryCategories: ["Food & Drink", "Entertainment", "Arts & Culture"],
            secondaryCategories: [],
            interests: ["Fine Dining", "Live Music"],
            confidence: 0.85,
            highPriority: true,
        },
        // Standard patterns
        {
            patterns: [/\bjazz\b/i, /\bblues\b/i],
            primaryCategories: ["Music"],
            secondaryCategories: [],
            interests: ["Jazz/Blues"],
            confidence: 0.9,
        },
        {
            patterns: [/\brock\b/i, /\bmetal\b/i],
            primaryCategories: ["Music"],
            secondaryCategories: [],
            interests: ["Rock/Metal"],
            confidence: 0.85,
        },
        {
            patterns: [/\bindie\b/i, /\bindependent\s*music\b/i],
            primaryCategories: ["Music"],
            secondaryCategories: [],
            interests: ["Indie Music"],
            confidence: 0.85,
        },
        {
            patterns: [/\bclassical\b/i, /\borchestra\b/i, /\bsymphony\b/i],
            primaryCategories: ["Music"],
            secondaryCategories: [],
            interests: ["Classical/Orchestral"],
            confidence: 0.9,
        },
        {
            patterns: [/\bhiking\b/i, /\btrekking\b/i, /\btrail\b/i],
            primaryCategories: ["Outdoor & Adventure"],
            secondaryCategories: [],
            interests: ["Hiking/Trekking"],
            confidence: 0.9,
        },
        {
            patterns: [/\bstartup\b/i, /\btech\s*(?:meetup|event|networking)\b/i, /\bprogramming\b/i],
            primaryCategories: ["Tech & Innovation"],
            secondaryCategories: ["Social & Networking"],
            interests: ["Startup Events", "Tech Meetups"],
            confidence: 0.85,
        },
        {
            patterns: [/\bworkshop\b/i, /\bclass(?:es)?\b/i, /\blearn\b/i],
            primaryCategories: ["Learning & Development"],
            secondaryCategories: [],
            interests: ["Workshops"],
            confidence: 0.8,
        },
        {
            patterns: [/\bfood\s*(?:festival|truck|fair)\b/i, /\bcuisine\b/i],
            primaryCategories: ["Food & Drink"],
            secondaryCategories: [],
            interests: ["Food Festivals"],
            confidence: 0.85,
        },
        {
            patterns: [/\bwine\b/i, /\btasting\b/i, /\bbrewery\b/i],
            primaryCategories: ["Food & Drink"],
            secondaryCategories: [],
            interests: ["Wine Tasting", "Craft Beer"],
            confidence: 0.85,
        },
        {
            patterns: [/\bcomedy\b/i, /\bstand\s*up\b/i, /\bstandup\b/i],
            primaryCategories: ["Entertainment"],
            secondaryCategories: [],
            interests: ["Comedy Shows", "Stand-up"],
            confidence: 0.9,
        },
        {
            patterns: [/\btheat(?:re|er)\b/i, /\bdrama\b/i, /\bplay\b/i],
            primaryCategories: ["Arts & Culture"],
            secondaryCategories: ["Entertainment"],
            interests: ["Theater/Drama"],
            confidence: 0.85,
        },
        {
            patterns: [/\bart\s*(?:exhibition|gallery|show)\b/i, /\bpainting\b/i],
            primaryCategories: ["Arts & Culture"],
            secondaryCategories: [],
            interests: ["Art Exhibitions", "Painting"],
            confidence: 0.85,
        },
        {
            patterns: [/\bclub(?:bing)?\b/i, /\bnight\s*life\b/i, /\bnightlife\b/i, /\bparty\b/i, /\bparties\b/i],
            primaryCategories: ["Nightlife & Parties"],
            secondaryCategories: [],
            interests: ["Club Events"],
            confidence: 0.85,
        },
    ];

/**
 * Extract keywords from query for taxonomy matching
 */
function extractKeywords(query: string): string[] {
    const stopWords = new Set([
        "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "of", "at", "by", "for",
        "with", "about", "into", "through", "during", "before", "after",
        "above", "below", "to", "from", "up", "down", "in", "out", "on",
        "off", "over", "under", "again", "further", "then", "once", "here",
        "there", "when", "where", "why", "how", "all", "each", "few", "more",
        "most", "other", "some", "such", "no", "nor", "not", "only", "own",
        "same", "so", "than", "too", "very", "just", "and", "but", "if", "or",
        "because", "as", "until", "while", "i", "me", "my", "we", "our", "you",
        "your", "he", "him", "she", "her", "it", "they", "them", "what",
        "which", "who", "whom", "this", "that", "these", "those", "am",
        "looking", "want", "need", "find", "suggest", "recommend", "help",
        "please", "any", "something", "anything", "things", "events",
    ]);

    return query
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word));
}

export const tagsTool = createTool({
    id: "tags",
    description: `
    Analyzes user query and extracts relevant event category tags.
    Maps natural language to the Happenings event taxonomy for filtering.
    
    Use this tool to understand what TYPE of events a user is looking for.
    
    Examples:
    - "chill jazz night" → tags: ["Music", "Jazz/Blues"]
    - "tech meetup" → tags: ["Tech & Innovation", "Startup Events"]
    - "date night ideas" → tags: ["Food & Drink", "Entertainment", "Fine Dining"]
    - "running events" → tags: ["Outdoor & Adventure", "Running/Marathons"]
  `,
    inputSchema: z.object({
        query: z.string().describe("The user's natural language query describing what they want"),
        context: z.string().optional().describe("Additional context about the user's situation"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        tags: z
            .object({
                primaryCategories: z.array(z.string()),
                secondaryCategories: z.array(z.string()),
                interests: z.array(z.string()),
            })
            .optional(),
        allTags: z.array(z.string()).describe("Flattened list of all tags for event filtering"),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().optional(),
        error: z.string().optional(),
    }),
    execute: async ({ context }) => {
        const { query, context: additionalContext } = context;
        const fullQuery = additionalContext ? `${query} ${additionalContext}` : query;

        try {
            // Step 1: Try high-priority semantic patterns first
            const highPriorityResult = matchSemanticPatterns(fullQuery, true);
            if (highPriorityResult && highPriorityResult.confidence >= 0.85) {
                const allTags = [
                    ...highPriorityResult.primaryCategories,
                    ...highPriorityResult.secondaryCategories,
                    ...highPriorityResult.interests,
                ];
                return {
                    success: true,
                    tags: {
                        primaryCategories: highPriorityResult.primaryCategories,
                        secondaryCategories: highPriorityResult.secondaryCategories,
                        interests: highPriorityResult.interests,
                    },
                    allTags: [...new Set(allTags)],
                    confidence: highPriorityResult.confidence,
                    reasoning: `Matched high-priority semantic pattern for: ${allTags.join(", ")}`,
                };
            }

            // Step 2: Try all semantic patterns
            const semanticResult = matchSemanticPatterns(fullQuery, false);
            if (semanticResult && semanticResult.confidence >= 0.7) {
                const allTags = [
                    ...semanticResult.primaryCategories,
                    ...semanticResult.secondaryCategories,
                    ...semanticResult.interests,
                ];
                return {
                    success: true,
                    tags: {
                        primaryCategories: semanticResult.primaryCategories,
                        secondaryCategories: semanticResult.secondaryCategories,
                        interests: semanticResult.interests,
                    },
                    allTags: [...new Set(allTags)],
                    confidence: semanticResult.confidence,
                    reasoning: `Matched semantic pattern for: ${allTags.join(", ")}`,
                };
            }

            // Step 3: Fall back to keyword matching
            const keywords = extractKeywords(fullQuery);
            const keywordMatches = findMatchingTags(keywords);

            if (
                keywordMatches.interests.length > 0 ||
                keywordMatches.secondaryCategories.length > 0
            ) {
                const allTags = [
                    ...keywordMatches.categories,
                    ...keywordMatches.secondaryCategories,
                    ...keywordMatches.interests,
                ];
                return {
                    success: true,
                    tags: {
                        primaryCategories: keywordMatches.categories,
                        secondaryCategories: keywordMatches.secondaryCategories,
                        interests: keywordMatches.interests,
                    },
                    allTags: [...new Set(allTags)],
                    confidence: 0.7,
                    reasoning: `Keyword matches: ${allTags.join(", ")}`,
                };
            }

            // Step 4: Use semantic result even if low confidence
            if (semanticResult) {
                const allTags = [
                    ...semanticResult.primaryCategories,
                    ...semanticResult.secondaryCategories,
                    ...semanticResult.interests,
                ];
                return {
                    success: true,
                    tags: {
                        primaryCategories: semanticResult.primaryCategories,
                        secondaryCategories: semanticResult.secondaryCategories,
                        interests: semanticResult.interests,
                    },
                    allTags: [...new Set(allTags)],
                    confidence: semanticResult.confidence,
                    reasoning: `Low-confidence semantic match: ${allTags.join(", ")}`,
                };
            }

            // Nothing matched - return empty
            return {
                success: true,
                tags: {
                    primaryCategories: [],
                    secondaryCategories: [],
                    interests: [],
                },
                allTags: [],
                confidence: 0.5,
                reasoning: "No specific event type detected, will search all categories",
            };
        } catch (error) {
            return {
                success: false,
                allTags: [],
                confidence: 0,
                error: error instanceof Error ? error.message : "Unknown error extracting tags",
            };
        }
    },
});

/**
 * Match semantic patterns against the query
 */
function matchSemanticPatterns(
    query: string,
    highPriorityOnly: boolean
): {
    primaryCategories: string[];
    secondaryCategories: string[];
    interests: string[];
    confidence: number;
} | null {
    const patterns = highPriorityOnly
        ? SEMANTIC_PATTERNS.filter((p) => p.highPriority)
        : SEMANTIC_PATTERNS;

    const matchedPatterns = patterns.filter((semantic) =>
        semantic.patterns.some((pattern) => pattern.test(query))
    );

    if (matchedPatterns.length === 0) return null;

    // Combine all matched patterns
    const combined = {
        primaryCategories: new Set<string>(),
        secondaryCategories: new Set<string>(),
        interests: new Set<string>(),
        confidence: 0,
    };

    for (const match of matchedPatterns) {
        match.primaryCategories.forEach((c) => combined.primaryCategories.add(c));
        match.secondaryCategories.forEach((c) => combined.secondaryCategories.add(c));
        match.interests.forEach((i) => combined.interests.add(i));
        combined.confidence = Math.max(combined.confidence, match.confidence);
    }

    return {
        primaryCategories: [...combined.primaryCategories],
        secondaryCategories: [...combined.secondaryCategories],
        interests: [...combined.interests],
        confidence: combined.confidence,
    };
}
