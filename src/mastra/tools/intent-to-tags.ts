import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { INTEREST_CATEGORIES, getTaxonomyPromptContext, findMatchingTags } from "./taxonomy";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";

// Create OpenAI provider for AI fallback
const openaiProvider = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Intent to Tags Tool
 *
 * Analyzes user intent/query and maps it to the Happenings taxonomy.
 * Uses a combination of:
 * 1. Fast keyword matching for direct matches
 * 2. AI-powered semantic analysis for complex queries
 *
 * This enables accurate event filtering based on natural language input.
 */

const TagsResult = z.object({
    primaryCategories: z
        .array(z.string())
        .describe("Primary category names (e.g., Music, Food & Drink)"),
    secondaryCategories: z
        .array(z.string())
        .describe("Secondary category names (e.g., Live Music, Bars & Pubs)"),
    interests: z.array(z.string()).describe("Specific interests (e.g., Jazz/Blues, Wine Tasting)"),
    confidence: z.number().min(0).max(1).describe("Confidence in the tag mapping"),
    reasoning: z.string().describe("Brief explanation of why these tags were chosen"),
});

export const intentToTagsTool = createTool({
    id: "intent-to-tags",
    description: `
    Analyzes a user's natural language query and maps it to the Happenings event taxonomy.
    Returns relevant categories and interests for event filtering.
    
    Use this tool when you need to understand what types of events a user is looking for
    based on their free-form text input.
    
    Examples:
    - "chill jazz night with friends" → Music: Jazz/Blues, Social & Networking
    - "weekend hiking trip" → Outdoor & Adventure: Hiking/Trekking
    - "startup networking event" → Tech & Innovation + Social & Networking
    - "fun things to do on a date" → Food & Drink, Entertainment, Arts & Culture
  `,
    inputSchema: z.object({
        query: z.string().describe("The user's natural language query describing what they want"),
        context: z
            .string()
            .optional()
            .describe("Additional context about the user or situation"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        tags: TagsResult.optional(),
        error: z.string().optional(),
    }),
    execute: async ({ context }) => {
        const { query, context: additionalContext } = context;

        try {
            // Step 1: Try semantic analysis for complex multi-word pattern matching
            const semanticResult = await analyzeIntentSemantically(query, additionalContext);

            // If semantic matched strongly (2+ patterns), use semantic results
            // This handles "team outing", "bachelor party", "birthday", etc.
            if (semanticResult.confidence >= 0.7) {
                return {
                    success: true,
                    tags: semanticResult,
                };
            }

            // Step 2: Also try keyword matching
            const keywords = extractKeywords(query);
            const keywordMatches = findMatchingTags(keywords);

            // Calculate keyword confidence
            const keywordConfidence = calculateConfidence(keywordMatches, query);

            // If keyword matches are good, use them
            if (
                keywordMatches.interests.length > 0 ||
                keywordMatches.secondaryCategories.length > 0
            ) {
                return {
                    success: true,
                    tags: {
                        primaryCategories: keywordMatches.categories,
                        secondaryCategories: keywordMatches.secondaryCategories,
                        interests: keywordMatches.interests,
                        confidence: keywordConfidence,
                        reasoning: `Direct keyword matches found: ${[...keywordMatches.interests, ...keywordMatches.secondaryCategories].join(", ")}`,
                    },
                };
            }

            // Step 3: If semantic result has low confidence, use AI as last resort
            if (semanticResult.confidence < 0.5) {
                console.log("[IntentToTags] Low confidence from pattern matching, falling back to AI extraction...");
                const aiResult = await extractTagsWithAI(query, additionalContext);
                if (aiResult) {
                    return {
                        success: true,
                        tags: aiResult,
                    };
                }
            }

            // Fall back to semantic result if AI also failed
            return {
                success: true,
                tags: semanticResult,
            };
        } catch (error) {
            console.error("Intent to tags error:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error analyzing intent",
            };
        }
    },
});

/**
 * Extract meaningful keywords from a query
 */
function extractKeywords(query: string): string[] {
    // Common stop words to filter out
    const stopWords = new Set([
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "i",
        "me",
        "my",
        "we",
        "us",
        "you",
        "your",
        "they",
        "them",
        "what",
        "where",
        "when",
        "how",
        "why",
        "want",
        "looking",
        "find",
        "search",
        "need",
        "things",
        "something",
        "stuff",
        "some",
        "any",
        "good",
        "best",
        "nice",
        "cool",
        "fun",
        "great",
        "awesome",
        "this",
        "that",
        "these",
        "those",
        "weekend",
        "today",
        "tomorrow",
        "tonight",
        "night",
        "day",
        "week",
        "month",
    ]);

    return query
        .toLowerCase()
        .replace(/[^\w\s]/g, " ") // Remove punctuation
        .split(/\s+/)
        .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Calculate confidence based on match quality
 */
function calculateConfidence(
    matches: { categories: string[]; secondaryCategories: string[]; interests: string[] },
    query: string
): number {
    let confidence = 0.5; // Base confidence

    // Boost for interests (most specific)
    if (matches.interests.length > 0) {
        confidence += 0.3;
    }

    // Boost for secondary categories
    if (matches.secondaryCategories.length > 0) {
        confidence += 0.15;
    }

    // Boost for primary categories
    if (matches.categories.length > 0) {
        confidence += 0.05;
    }

    return Math.min(1, confidence);
}

/**
 * Semantic analysis using pattern matching
 * (Could be enhanced with actual LLM call if needed)
 */
async function analyzeIntentSemantically(
    query: string,
    additionalContext?: string
): Promise<z.infer<typeof TagsResult>> {
    const lowerQuery = query.toLowerCase();

    // High-priority patterns that should take precedence when matched
    // These are checked first and return immediately if matched
    const highPriorityPatterns: Array<{
        patterns: RegExp[];
        categories: string[];
        secondary: string[];
        interests: string[];
    }> = [
            // EDM/Electronic specific - high priority when EDM is mentioned
            {
                patterns: [/\bedm\b/i, /edm\//i, /electronic\s*music/i, /techno/i, /house\s*music/i, /rave/i],
                categories: ["Music"],
                secondary: ["DJ/Club", "Music Festivals"],
                interests: ["DJ Nights", "Electronic/EDM"],
            },
            // Running/Marathon specific - high priority
            {
                patterns: [/running\s*group/i, /marathon\s*training/i, /marathon/i, /running/i],
                categories: ["Sports & Fitness"],
                secondary: ["Participatory Sports", "Fitness Classes"],
                interests: ["Running/Marathons", "CrossFit/HIIT"],
            },
            // Yoga/Wellness specific - high priority
            {
                patterns: [/yoga\s*retreat/i, /wellness\s*workshop/i, /yoga/i, /retreat/i, /wellness/i],
                categories: ["Wellness & Health"],
                secondary: ["Mind & Body", "Retreats"],
                interests: ["Yoga", "Meditation", "Spa/Wellness", "Wellness Retreats"],
            },
        ];

    // Check high-priority patterns first
    for (const hp of highPriorityPatterns) {
        if (hp.patterns.some((p) => p.test(lowerQuery))) {
            return {
                primaryCategories: hp.categories,
                secondaryCategories: hp.secondary,
                interests: hp.interests,
                confidence: 0.9, // High confidence for priority matches
                reasoning: `High-priority pattern matched for specific category`,
            };
        }
    }

    // Pattern-based semantic matching (regular patterns)
    const patterns: Array<{
        patterns: RegExp[];
        categories: string[];
        secondary: string[];
        interests: string[];
    }> = [
            // Sports Viewing/Match Screening patterns - must come before generic sports
            {
                patterns: [/watch.*match/i, /match.*screen/i, /screening/i, /watch.*game/i, /watch party/i, /india vs/i, /vs.*match/i, /sports bar/i, /watch the/i],
                categories: ["Sports & Fitness", "Entertainment"],
                secondary: ["Watch Parties"],
                interests: ["Cricket", "Football/Soccer", "Film Screenings"],
            },
            // Romantic/Date patterns
            {
                patterns: [/date/i, /romantic/i, /couple/i, /anniversary/i, /girlfriend/i, /boyfriend/i, /spouse/i, /wife/i, /husband/i],
                categories: ["Food & Drink", "Arts & Culture", "Entertainment"],
                secondary: ["Dining Experiences", "Visual Arts", "Theatre"],
                interests: ["Fine Dining", "Art Exhibitions", "Theatre/Drama", "Wine Tasting"],
            },
            // Birthday/Celebration patterns - specific for birthdays
            {
                patterns: [/birthday/i, /bday/i, /b'day/i],
                categories: ["Entertainment", "Food & Drink", "Music"],
                secondary: ["Dining Experiences", "Live Music", "Comedy"],
                interests: ["Fine Dining", "Live Performances", "Stand-up Comedy", "Themed Parties"],
            },
            // Bachelor/Bachelorette Party patterns - specific for wild parties
            {
                patterns: [/bachelor/i, /bachelorette/i, /hen party/i, /stag/i],
                categories: ["Entertainment", "Music", "Food & Drink"],
                secondary: ["DJ/Club", "Bars & Pubs", "Comedy"],
                interests: ["DJ Nights", "Cocktail Events", "Themed Parties", "Live Performances"],
            },
            // Generic Party/Celebration patterns
            {
                patterns: [/party/i, /celebrate/i, /night out/i, /wild/i, /crazy/i],
                categories: ["Entertainment", "Music", "Food & Drink"],
                secondary: ["DJ/Club", "Bars & Pubs", "Comedy"],
                interests: ["DJ Nights", "Cocktail Events", "Themed Parties", "Live Performances"],
            },
            // Team/Office Outing patterns - focus on social & group activities
            {
                patterns: [/team outing/i, /office outing/i, /team building/i, /corporate outing/i, /colleagues/i, /coworkers/i, /company outing/i],
                categories: ["Social & Networking", "Outdoor & Adventure", "Entertainment"],
                secondary: ["Professional", "Nature", "Gaming"],
                interests: ["Networking Events", "Hiking/Trekking", "Trivia Nights", "Team Sports"],
            },
            // Generic Office/Team patterns (less specific)
            {
                patterns: [/team/i, /office/i, /corporate/i, /company/i],
                categories: ["Social & Networking", "Entertainment"],
                secondary: ["Professional", "Gaming"],
                interests: ["Networking Events", "Trivia Nights", "Team Sports"],
            },
            // Chill/Relaxation patterns
            {
                patterns: [/chill/i, /relax/i, /calm/i, /peaceful/i, /unwind/i, /quiet/i],
                categories: ["Wellness & Health", "Arts & Culture", "Music"],
                secondary: ["Mind & Body", "Literary", "Live Music"],
                interests: ["Meditation", "Jazz/Blues", "Coffee/Tea Events"],
            },
            // Learning patterns - only match when NOT wellness/fitness/sports related
            // This is less greedy - specific skill learning contexts
            {
                patterns: [/learn(?!\s*(?:yoga|fitness|running|swimming))/i, /cooking class/i, /\bcourse\b/i, /training(?!\s*(?:marathon|running|fitness))/i, /skill/i, /coding/i, /craft/i],
                categories: ["Arts & Culture", "Tech & Innovation", "Food & Drink"],
                secondary: ["Workshops", "Literary"],
                interests: ["Craft Workshops", "Coding Bootcamps", "Cooking Classes"],
            },
            // Friends/Social patterns - avoid matching "running group" or "training"
            {
                patterns: [/friends/i, /\bgang\b/i, /squad/i, /hangout/i, /catch up/i, /\bgroup(?!\s+(?:of|for|training|run))/i],
                categories: ["Social & Networking", "Entertainment", "Sports & Fitness"],
                secondary: ["Casual", "Gaming"],
                interests: ["Trivia Nights", "Board Games", "Team Sports"],
            },
            // Outdoor patterns
            {
                patterns: [/outdoor/i, /nature/i, /adventure/i, /trek/i, /hike/i, /camp/i],
                categories: ["Outdoor & Adventure"],
                secondary: ["Nature", "Extreme Sports"],
                interests: ["Hiking/Trekking", "Camping", "Wildlife Safari"],
            },
            // Professional/Networking patterns
            {
                patterns: [/startup/i, /business/i, /entrepreneur/i, /network/i, /professional/i, /founder/i, /investor/i],
                categories: ["Tech & Innovation", "Social & Networking"],
                secondary: ["Meetups", "Professional"],
                interests: ["Startup Events", "Networking Events", "Tech Talks"],
            },
            // Music patterns
            {
                patterns: [/music/i, /concert/i, /live/i, /band/i, /gig/i, /singing/i, /singer/i],
                categories: ["Music"],
                secondary: ["Live Music", "Concerts"],
                interests: ["Live Performances", "Indie/Alternative", "Rock/Metal"],
            },
            // Food patterns
            {
                patterns: [/food/i, /eat/i, /cuisine/i, /restaurant/i, /foodie/i, /dinner/i, /lunch/i, /brunch/i],
                categories: ["Food & Drink"],
                secondary: ["Dining Experiences", "Food Events"],
                interests: ["Fine Dining", "Street Food", "Food Festivals", "Brunches"],
            },
            // Drink/Bar patterns
            {
                patterns: [/drink/i, /bar/i, /pub/i, /beer/i, /wine/i, /cocktail/i, /brewery/i],
                categories: ["Food & Drink"],
                secondary: ["Bars & Pubs"],
                interests: ["Wine Tasting", "Beer/Brewery Tours", "Cocktail Events"],
            },
            {
                patterns: [/comedy/i, /laugh/i, /funny/i, /standup/i, /stand-up/i],
                categories: ["Entertainment"],
                secondary: ["Comedy"],
                interests: ["Stand-up Comedy", "Improv Shows"],
            },
            {
                patterns: [/art/i, /exhibition/i, /gallery/i, /museum/i, /culture/i],
                categories: ["Arts & Culture"],
                secondary: ["Visual Arts", "Museums"],
                interests: ["Art Exhibitions", "Museum Visits", "Photography"],
            },
            {
                patterns: [/health/i, /wellness/i, /yoga/i, /meditat/i, /spa/i, /retreat/i, /healing/i],
                categories: ["Wellness & Health"],
                secondary: ["Mind & Body", "Retreats"],
                interests: ["Yoga", "Meditation", "Spa/Wellness", "Wellness Retreats"],
            },
            // Running/Marathon specific - before generic sports AND before friends/group
            {
                patterns: [/run(?:ning)?(?:\s+group)?/i, /marathon/i, /5k/i, /10k/i, /jog(?:ging)?/i, /running group/i],
                categories: ["Sports & Fitness"],
                secondary: ["Participatory Sports", "Fitness Classes"],
                interests: ["Running/Marathons", "CrossFit/HIIT"],
            },
            // Generic sports patterns
            {
                patterns: [/sport/i, /fitness/i, /gym/i, /exercise/i],
                categories: ["Sports & Fitness"],
                secondary: ["Participatory Sports", "Fitness Classes"],
                interests: ["Running/Marathons", "CrossFit/HIIT", "Yoga"],
            },
            // EDM/Electronic specific - use word boundaries and handle EDM/electronic format
            {
                patterns: [/\bedm\b/i, /electronic\s*music/i, /electronic\b/i, /\bdj\b/i, /techno/i, /house\s*music/i, /rave/i, /\bclub\b/i, /edm\//i],
                categories: ["Music"],
                secondary: ["DJ/Club", "Music Festivals"],
                interests: ["DJ Nights", "Electronic/EDM"],
            },
            {
                patterns: [/tech/i, /code/i, /developer/i, /programming/i, /ai/i, /ml/i],
                categories: ["Tech & Innovation"],
                secondary: ["Meetups", "Workshops", "Hackathons"],
                interests: ["Tech Talks", "AI/ML Workshops", "Hackathons"],
            },
        ];

    // Find matching patterns
    const matched = {
        categories: new Set<string>(),
        secondary: new Set<string>(),
        interests: new Set<string>(),
    };

    let matchCount = 0;

    for (const pattern of patterns) {
        if (pattern.patterns.some((p) => p.test(lowerQuery))) {
            matchCount++;
            pattern.categories.forEach((c) => matched.categories.add(c));
            pattern.secondary.forEach((s) => matched.secondary.add(s));
            pattern.interests.forEach((i) => matched.interests.add(i));
        }
    }

    // If no patterns matched, return generic social categories
    if (matchCount === 0) {
        return {
            primaryCategories: ["Entertainment"],
            secondaryCategories: [],
            interests: [],
            confidence: 0.3,
            reasoning: "No specific patterns matched; using broad categories for general exploration",
        };
    }

    return {
        primaryCategories: Array.from(matched.categories).slice(0, 3),
        secondaryCategories: Array.from(matched.secondary).slice(0, 4),
        interests: Array.from(matched.interests).slice(0, 5),
        confidence: Math.min(0.9, 0.5 + matchCount * 0.1),
        reasoning: `Matched ${matchCount} semantic pattern(s) in query`,
    };
}

/**
 * AI-based tag extraction as last resort fallback
 * Uses GPT-4o-mini to analyze the query and extract relevant tags from the taxonomy
 */
async function extractTagsWithAI(
    query: string,
    additionalContext?: string
): Promise<z.infer<typeof TagsResult> | null> {
    try {
        // Get all available categories and interests from taxonomy
        const allPrimaryCategories = INTEREST_CATEGORIES.map((c) => c.name);
        const allSecondaryCategories = INTEREST_CATEGORIES.flatMap((c) => c.secondaryCategories);
        const allInterests = INTEREST_CATEGORIES.flatMap((c) => c.interests);

        const prompt = `You are an expert at understanding user intent and mapping it to event categories.

Given a user's query about events they're looking for, extract the most relevant tags from the Happenings event taxonomy.

## User Query:
"${query}"
${additionalContext ? `\n## Additional Context:\n${additionalContext}` : ""}

## Available Primary Categories (choose 1-3):
${allPrimaryCategories.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

## Available Secondary Categories (choose 1-4 that best match):
${allSecondaryCategories.map((sec, i) => `${i + 1}. ${sec}`).join('\n')}

## Available Interests/Genres (choose 1-5 most specific matches):
${allInterests.map((int, i) => `${i + 1}. ${int}`).join('\n')}

## Instructions:
1. Analyze what types of events the user is looking for
2. Select 1-3 primaryCategories from the list above that best match the user's intent
3. Select 1-4 secondaryCategories from the list above that are most relevant
4. Select 1-5 interests from the list above that are most specific to the query
5. ONLY use exact category/interest names from the lists above - do not modify or invent new ones
6. Consider implicit intent (e.g., "date night" → Food & Drink, Arts & Culture, Entertainment)
7. Be specific rather than broad when possible (prefer interests over broad categories)
8. Return empty arrays if no good matches exist rather than forcing a match`;

        const result = await generateObject({
            model: openaiProvider("gpt-4o-mini") as any,
            schema: z.object({
                primaryCategories: z.array(z.string()).max(3),
                secondaryCategories: z.array(z.string()).max(4),
                interests: z.array(z.string()).max(5),
                reasoning: z.string(),
            }),
            prompt,
        });

        console.log("[IntentToTags] AI extraction result:", JSON.stringify(result.object, null, 2));

        // Validate that returned tags exist in taxonomy
        const validPrimary = result.object.primaryCategories.filter((cat) =>
            INTEREST_CATEGORIES.some((c) => c.name === cat)
        );
        const validSecondary = result.object.secondaryCategories.filter((sec) =>
            INTEREST_CATEGORIES.some((c) => c.secondaryCategories.includes(sec))
        );
        const validInterests = result.object.interests.filter((int) =>
            INTEREST_CATEGORIES.some((c) => c.interests.includes(int))
        );

        // If AI returned mostly invalid tags, return null to fall back
        if (validPrimary.length === 0 && validSecondary.length === 0 && validInterests.length === 0) {
            console.log("[IntentToTags] AI returned no valid taxonomy tags, falling back");
            return null;
        }

        return {
            primaryCategories: validPrimary,
            secondaryCategories: validSecondary,
            interests: validInterests,
            confidence: 0.75, // AI extraction gets moderate-high confidence
            reasoning: `AI extraction: ${result.object.reasoning}`,
        };
    } catch (error) {
        console.error("[IntentToTags] AI extraction failed:", error);
        return null;
    }
}

/**
 * Get all available tags for reference/validation
 */
export function getAvailableTags(): {
    primaryCategories: string[];
    allSecondaryCategories: string[];
    allInterests: string[];
} {
    return {
        primaryCategories: INTEREST_CATEGORIES.map((c) => c.name),
        allSecondaryCategories: INTEREST_CATEGORIES.flatMap((c) => c.secondaryCategories),
        allInterests: INTEREST_CATEGORIES.flatMap((c) => c.interests),
    };
}
