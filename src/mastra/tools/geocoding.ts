import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Geocoding Tool
 *
 * Converts city/location names to geographic coordinates using Google Maps
 * Geocoding API for production reliability.
 *
 * Fallback: Uses pre-defined coordinates for common Indian cities.
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const GeocodingResult = z.object({
    latitude: z.number(),
    longitude: z.number(),
    displayName: z.string(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string(),
    confidence: z.number().min(0).max(1),
});

export const geocodingTool = createTool({
    id: "geocoding",
    description: `
    Converts a city or location name to geographic coordinates (latitude/longitude).
    Use this tool when you need to find events near a specific location.
    Returns the best matching location with coordinates and confidence score.
    Supports city names, neighborhoods, and full addresses.
    
    Examples:
    - "Bangalore" → { latitude: 12.9716, longitude: 77.5946 }
    - "Koramangala, Bangalore" → { latitude: 12.9347, longitude: 77.6134 }
    - "Mumbai" → { latitude: 19.0760, longitude: 72.8777 }
  `,
    inputSchema: z.object({
        location: z.string().describe("City name, neighborhood, or address to geocode"),
        country: z
            .string()
            .default("India")
            .describe("Country to bias search results (default: India)"),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        result: GeocodingResult.optional(),
        error: z.string().optional(),
    }),
    execute: async ({ context }) => {
        const { location, country } = context;

        // First try quick lookup for common cities
        const quickResult = getQuickCoordinates(location);
        if (quickResult) {
            return {
                success: true,
                result: {
                    latitude: quickResult.lat,
                    longitude: quickResult.lng,
                    displayName: location,
                    city: location,
                    country: country,
                    confidence: 0.95,
                },
            };
        }

        // Use Google Maps API if available
        if (GOOGLE_MAPS_API_KEY) {
            try {
                return await geocodeWithGoogle(location, country);
            } catch (error) {
                console.error("Google geocoding error, falling back to Nominatim:", error);
            }
        }

        // Fallback to Nominatim (OpenStreetMap)
        return await geocodeWithNominatim(location, country);
    },
});

/**
 * Geocode using Google Maps API (more reliable for production)
 */
async function geocodeWithGoogle(
    location: string,
    country: string
): Promise<{ success: boolean; result?: z.infer<typeof GeocodingResult>; error?: string }> {
    const query = `${location}, ${country}`;
    const encodedQuery = encodeURIComponent(query);

    const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedQuery}&key=${GOOGLE_MAPS_API_KEY}`
    );

    if (!response.ok) {
        throw new Error(`Google Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "OK" || !data.results?.length) {
        return {
            success: false,
            error: `Location not found: "${location}" (Status: ${data.status})`,
        };
    }

    const result = data.results[0];
    const geometry = result.geometry;

    // Parse address components
    const addressComponents = result.address_components || [];
    let city: string | undefined;
    let state: string | undefined;
    let countryName = country;

    for (const component of addressComponents) {
        if (component.types.includes("locality")) {
            city = component.long_name;
        } else if (component.types.includes("administrative_area_level_1")) {
            state = component.long_name;
        } else if (component.types.includes("country")) {
            countryName = component.long_name;
        }
    }

    // Calculate confidence based on location_type
    let confidence = 0.7;
    if (geometry.location_type === "ROOFTOP") {
        confidence = 0.95;
    } else if (geometry.location_type === "RANGE_INTERPOLATED") {
        confidence = 0.85;
    } else if (geometry.location_type === "GEOMETRIC_CENTER") {
        confidence = 0.8;
    }

    return {
        success: true,
        result: {
            latitude: geometry.location.lat,
            longitude: geometry.location.lng,
            displayName: result.formatted_address,
            city,
            state,
            country: countryName,
            confidence,
        },
    };
}

/**
 * Geocode using Nominatim (OpenStreetMap) - free fallback
 */
async function geocodeWithNominatim(
    location: string,
    country: string
): Promise<{ success: boolean; result?: z.infer<typeof GeocodingResult>; error?: string }> {
    try {
        const query = `${location}, ${country}`;
        const encodedQuery = encodeURIComponent(query);

        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&addressdetails=1&limit=1`,
            {
                headers: {
                    "User-Agent": "HappeningsBot/1.0 (contact@happenings.com)",
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Nominatim API error: ${response.status}`);
        }

        const results = await response.json();

        if (!results || results.length === 0) {
            return {
                success: false,
                error: `Location not found: "${location}"`,
            };
        }

        const result = results[0];
        const address = result.address || {};

        let confidence = 0.5;
        if (result.type === "city" || result.type === "administrative") {
            confidence = 0.9;
        } else if (result.type === "suburb" || result.type === "neighbourhood") {
            confidence = 0.85;
        }

        return {
            success: true,
            result: {
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon),
                displayName: result.display_name,
                city: address.city || address.town || address.village,
                state: address.state,
                country: address.country || country,
                confidence,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown geocoding error",
        };
    }
}

/**
 * Common Indian city coordinates for fallback
 * Used when geocoding fails or for fast lookups
 */
export const INDIAN_CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
    bangalore: { lat: 12.9716, lng: 77.5946 },
    bengaluru: { lat: 12.9716, lng: 77.5946 },
    mumbai: { lat: 19.076, lng: 72.8777 },
    delhi: { lat: 28.6139, lng: 77.209 },
    "new delhi": { lat: 28.6139, lng: 77.209 },
    hyderabad: { lat: 17.385, lng: 78.4867 },
    chennai: { lat: 13.0827, lng: 80.2707 },
    kolkata: { lat: 22.5726, lng: 88.3639 },
    pune: { lat: 18.5204, lng: 73.8567 },
    ahmedabad: { lat: 23.0225, lng: 72.5714 },
    jaipur: { lat: 26.9124, lng: 75.7873 },
    goa: { lat: 15.2993, lng: 74.124 },
    kochi: { lat: 9.9312, lng: 76.2673 },
    gurgaon: { lat: 28.4595, lng: 77.0266 },
    gurugram: { lat: 28.4595, lng: 77.0266 },
    noida: { lat: 28.5355, lng: 77.391 },
    chandigarh: { lat: 30.7333, lng: 76.7794 },
};

/**
 * Fast lookup for common cities (no API call needed)
 */
export function getQuickCoordinates(city: string): { lat: number; lng: number } | null {
    const normalized = city.toLowerCase().trim();
    return INDIAN_CITY_COORDINATES[normalized] || null;
}
