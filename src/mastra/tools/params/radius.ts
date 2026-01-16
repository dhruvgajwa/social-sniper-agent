import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Radius Extraction Tool
 *
 * Determines appropriate search radius based on location specificity.
 * - Specific neighborhoods (HSR Layout, Koramangala) → smaller radius (5km)
 * - Cities (Pune, Bangalore) → larger radius (20km)
 * - Regions/states → even larger (50km)
 */

/**
 * Known neighborhoods that should use smaller radius
 */
const NEIGHBORHOODS = new Set([
    "koramangala", "indiranagar", "hsr layout", "whitefield", "electronic city",
    "jayanagar", "jp nagar", "marathahalli", "bellandur", "sarjapur",
    "bandra", "andheri", "juhu", "powai", "worli", "lower parel", "malad",
    "aundh", "kothrud", "baner", "hinjewadi", "wakad", "viman nagar",
    "jubilee hills", "banjara hills", "madhapur", "gachibowli", "hitech city",
    "anna nagar", "t nagar", "adyar", "velachery", "ecr",
    "connaught place", "hauz khas", "vasant kunj", "dwarka", "saket",
]);

/**
 * City/area size classifications for radius determination
 */
const AREA_CLASSIFICATIONS: Array<{
    patterns: RegExp[];
    radius: number;
    type: "neighborhood" | "city" | "region";
}> = [
        // Explicit distance mentions override everything
        {
            patterns: [/within\s*(\d+)\s*km/i, /(\d+)\s*km\s*(?:radius|around|near)/i],
            radius: -1, // Will be extracted from match
            type: "city",
        },
        // "Nearby" implies small radius
        {
            patterns: [/\bnearby\b/i, /\bnear\s*(?:me|here)\b/i, /\bclose\s*by\b/i, /\bwalking\s*distance\b/i],
            radius: 3,
            type: "neighborhood",
        },
        // Specific area mentions
        {
            patterns: [/\bin\s*the\s*area\b/i, /\baround\s*here\b/i],
            radius: 5,
            type: "neighborhood",
        },
        // "Anywhere in city" implies larger radius
        {
            patterns: [/\banywhere\s*in\b/i, /\ball\s*over\b/i, /\bthroughout\b/i],
            radius: 25,
            type: "region",
        },
    ];

export const radiusTool = createTool({
    id: "radius",
    description: `
    Determines the appropriate search radius based on user query and location type.
    
    Use this tool to decide how wide to search for events:
    - Specific neighborhoods → 5km radius
    - General city queries → 20km radius
    - Regional queries → 50km radius
    - Explicit distance mentions take priority
    
    Examples:
    - "events in HSR Layout" → 5km (specific neighborhood)
    - "what's happening in Pune" → 20km (city-wide)
    - "events nearby" → 3km (close proximity)
    - "within 10km" → 10km (explicit)
  `,
    inputSchema: z.object({
        query: z.string().describe("The user's query to analyze for distance preferences"),
        detectedLocation: z.string().optional().describe("The location already detected from the query"),
        isNeighborhood: z.boolean().optional().describe("Whether the location is a neighborhood"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        radiusKm: z.number().describe("Recommended search radius in kilometers"),
        reasoning: z.string().describe("Why this radius was chosen"),
        locationType: z.enum(["neighborhood", "city", "region"]).describe("Classification of the location"),
    }),
    execute: async ({ context }) => {
        const { query, detectedLocation, isNeighborhood } = context;
        const queryLower = query.toLowerCase();
        const locationLower = (detectedLocation || "").toLowerCase();

        // Check for explicit distance mentions first
        const explicitMatch = query.match(/within\s*(\d+)\s*km/i) ||
            query.match(/(\d+)\s*km\s*(?:radius|around|near)/i);
        if (explicitMatch) {
            const radius = parseInt(explicitMatch[1], 10);
            const locationType = radius <= 5 ? "neighborhood" as const : radius <= 25 ? "city" as const : "region" as const;
            return {
                success: true,
                radiusKm: radius,
                reasoning: `User explicitly specified ${radius}km radius`,
                locationType,
            };
        }

        // Check if the detected location is a known neighborhood
        if (isNeighborhood || NEIGHBORHOODS.has(locationLower)) {
            return {
                success: true,
                radiusKm: 5,
                reasoning: `"${detectedLocation || 'the location'}" is a specific neighborhood, using 5km radius`,
                locationType: "neighborhood" as const,
            };
        }

        // Check for proximity indicators in query
        for (const classification of AREA_CLASSIFICATIONS) {
            for (const pattern of classification.patterns) {
                if (pattern.test(queryLower)) {
                    if (classification.radius === -1) continue; // Skip explicit distance patterns
                    return {
                        success: true,
                        radiusKm: classification.radius,
                        reasoning: `Query indicates ${classification.type}-level search`,
                        locationType: classification.type,
                    };
                }
            }
        }

        // Default based on whether we have a location
        if (detectedLocation) {
            // Check if any neighborhood names appear in the location
            const hasNeighborhoodInLocation = [...NEIGHBORHOODS].some(
                (n) => locationLower.includes(n) || n.includes(locationLower)
            );

            if (hasNeighborhoodInLocation) {
                return {
                    success: true,
                    radiusKm: 5,
                    reasoning: `Location "${detectedLocation}" appears to be a neighborhood`,
                    locationType: "neighborhood" as const,
                };
            }

            // Default city-level radius
            return {
                success: true,
                radiusKm: 20,
                reasoning: `City-level search for "${detectedLocation}"`,
                locationType: "city" as const,
            };
        }

        // No location - use medium radius
        return {
            success: true,
            radiusKm: 20,
            reasoning: "No specific location detected, using default city radius",
            locationType: "city" as const,
        };
    },
});
