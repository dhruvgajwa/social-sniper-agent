import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Coordinates Extraction Tool
 *
 * Extracts and converts location information from user queries to geographic coordinates.
 * Uses Google Maps API for accurate geocoding with fallback to known Indian cities.
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Pre-defined coordinates for major Indian cities (fallback)
 */
const INDIAN_CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
    bangalore: { lat: 12.9716, lng: 77.5946 },
    bengaluru: { lat: 12.9716, lng: 77.5946 },
    mumbai: { lat: 19.076, lng: 72.8777 },
    delhi: { lat: 28.6139, lng: 77.209 },
    "new delhi": { lat: 28.6139, lng: 77.209 },
    chennai: { lat: 13.0827, lng: 80.2707 },
    hyderabad: { lat: 17.385, lng: 78.4867 },
    pune: { lat: 18.5204, lng: 73.8567 },
    kolkata: { lat: 22.5726, lng: 88.3639 },
    ahmedabad: { lat: 23.0225, lng: 72.5714 },
    jaipur: { lat: 26.9124, lng: 75.7873 },
    lucknow: { lat: 26.8467, lng: 80.9462 },
    chandigarh: { lat: 30.7333, lng: 76.7794 },
    goa: { lat: 15.2993, lng: 74.124 },
    kochi: { lat: 9.9312, lng: 76.2673 },
    gurgaon: { lat: 28.4595, lng: 77.0266 },
    gurugram: { lat: 28.4595, lng: 77.0266 },
    noida: { lat: 28.5355, lng: 77.391 },
    // Common neighborhoods
    "koramangala": { lat: 12.9352, lng: 77.6245 },
    "indiranagar": { lat: 12.9784, lng: 77.6408 },
    "hsr layout": { lat: 12.9081, lng: 77.6476 },
    "whitefield": { lat: 12.9698, lng: 77.7499 },
    "bandra": { lat: 19.0596, lng: 72.8295 },
    "andheri": { lat: 19.1136, lng: 72.8697 },
    "aundh": { lat: 18.5590, lng: 73.8076 },
};

/**
 * Quick lookup for known locations
 */
function getQuickCoordinates(location: string): { lat: number; lng: number } | null {
    const normalized = location.toLowerCase().trim();
    return INDIAN_CITY_COORDINATES[normalized] || null;
}

/**
 * Geocode using Google Maps API
 */
async function geocodeWithGoogle(
    location: string,
    country: string = "India"
): Promise<{ lat: number; lng: number; displayName: string; confidence: number } | null> {
    if (!GOOGLE_MAPS_API_KEY) return null;

    try {
        const query = `${location}, ${country}`;
        const encodedQuery = encodeURIComponent(query);
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedQuery}&key=${GOOGLE_MAPS_API_KEY}`
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (data.status !== "OK" || !data.results?.[0]) return null;

        const result = data.results[0];
        return {
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            displayName: result.formatted_address,
            confidence: result.geometry.location_type === "ROOFTOP" ? 1.0 : 0.85,
        };
    } catch {
        return null;
    }
}

export const coordinatesTool = createTool({
    id: "coordinates",
    description: `
    Extracts location from user query and converts to geographic coordinates.
    
    Use this tool when you need to:
    - Find the geographic center for a location-based event search
    - Determine which city/area the user is asking about
    
    Returns latitude/longitude coordinates for use with event-search.
    
    Examples:
    - "events in Bangalore" → { lat: 12.9716, lng: 77.5946, location: "Bangalore" }
    - "concerts in Koramangala" → { lat: 12.9352, lng: 77.6245, location: "Koramangala, Bangalore" }
    - "what's happening in Aundh Pune" → { lat: 18.5590, lng: 73.8076, location: "Aundh, Pune" }
  `,
    inputSchema: z.object({
        query: z.string().describe("The user's natural language query containing location info"),
        defaultCity: z
            .string()
            .optional()
            .describe("Default city to use if none detected (e.g., 'Bangalore')"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        coordinates: z
            .object({
                latitude: z.number(),
                longitude: z.number(),
            })
            .optional(),
        location: z.string().optional().describe("Detected location name"),
        isNeighborhood: z.boolean().describe("Whether the location is a specific neighborhood vs city"),
        confidence: z.number().min(0).max(1),
        error: z.string().optional(),
    }),
    execute: async ({ context }) => {
        const { query, defaultCity } = context;
        const queryLower = query.toLowerCase();

        // Try to find location mentions in the query
        const locationPatterns = [
            // "in <city>" pattern
            /\bin\s+([a-zA-Z\s]+?)(?:\s+for|\s+this|\s+next|\s+today|\s+tomorrow|\?|$)/i,
            // "near <city>" pattern
            /\bnear\s+([a-zA-Z\s]+?)(?:\s+for|\s+this|\s+next|\?|$)/i,
            // "around <city>" pattern
            /\baround\s+([a-zA-Z\s]+?)(?:\s+for|\s+this|\?|$)/i,
            // "<city> events" pattern
            /^([a-zA-Z\s]+?)\s+(?:events?|concerts?|shows?)/i,
        ];

        let detectedLocation: string | null = null;

        // Try patterns
        for (const pattern of locationPatterns) {
            const match = query.match(pattern);
            if (match?.[1]) {
                detectedLocation = match[1].trim();
                break;
            }
        }

        // If no pattern match, check for known city names in query
        if (!detectedLocation) {
            for (const cityName of Object.keys(INDIAN_CITY_COORDINATES)) {
                if (queryLower.includes(cityName)) {
                    detectedLocation = cityName;
                    break;
                }
            }
        }

        // Use default if nothing detected
        if (!detectedLocation && defaultCity) {
            detectedLocation = defaultCity;
        }

        if (!detectedLocation) {
            return {
                success: false,
                isNeighborhood: false,
                confidence: 0,
                error: "Could not detect any location in the query",
            };
        }

        // Check if it's a known neighborhood
        const isNeighborhood = [
            "koramangala", "indiranagar", "hsr layout", "whitefield",
            "bandra", "andheri", "aundh"
        ].some(n => queryLower.includes(n));

        // Try quick lookup first
        const quickResult = getQuickCoordinates(detectedLocation);
        if (quickResult) {
            return {
                success: true,
                coordinates: {
                    latitude: quickResult.lat,
                    longitude: quickResult.lng,
                },
                location: detectedLocation,
                isNeighborhood,
                confidence: 0.95,
            };
        }

        // Try Google Maps API
        const googleResult = await geocodeWithGoogle(detectedLocation);
        if (googleResult) {
            return {
                success: true,
                coordinates: {
                    latitude: googleResult.lat,
                    longitude: googleResult.lng,
                },
                location: googleResult.displayName,
                isNeighborhood,
                confidence: googleResult.confidence,
            };
        }

        // Fallback - couldn't geocode
        return {
            success: false,
            location: detectedLocation,
            isNeighborhood: false,
            confidence: 0,
            error: `Could not find coordinates for "${detectedLocation}"`,
        };
    },
});

export { INDIAN_CITY_COORDINATES, getQuickCoordinates };
