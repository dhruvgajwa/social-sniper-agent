import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getQuickCoordinates, INDIAN_CITY_COORDINATES } from "./geocoding";
import { generateEventUrl } from "./utils/utm";

/**
 * Happenings Event API Configuration
 */
const HAPPENINGS_API_BASE = "https://backend-production-042d.up.railway.app";
const DEFAULT_RADIUS_KM = 50;
const DEFAULT_LIMIT = 10;

/**
 * Event schema matching the Happenings API response structure
 */
const HappeningsEvent = z.object({
  _id: z.string(),
  eventName: z.string(),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  venue: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  location: z
    .object({
      type: z.literal("Point").optional(),
      coordinates: z.tuple([z.number(), z.number()]).optional(), // [lng, lat]
    })
    .optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  eventUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  source: z.string().optional(),
  distance: z.number().optional(), // Distance in km when sorted by location
});

/**
 * Simplified event result for agent consumption
 */
const EventResult = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  date: z.string(),
  endDate: z.string().optional(),
  venue: z.string(),
  address: z.string().optional(),
  city: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  url: z.string().describe("Original event URL (ticket source)"),
  happeningsUrl: z.string().describe("Happenings page URL with UTM tracking"),
  price: z.string(),
  distance: z.number().optional(),
  imageUrl: z.string().optional(),
});

export const eventSearchTool = createTool({
  id: "event-search",
  description: `
    Searches the Happenings database for events matching the user's criteria.
    
    Uses the real Happenings API with support for:
    - Geolocation-based search (events near a location)
    - Category and tag filtering
    - Distance-based sorting
    
    The tool automatically handles city-to-coordinates conversion for common Indian cities.
    For best results, provide coordinates directly when available.
    
    Examples:
    - Search events in Bangalore → Uses pre-defined coordinates
    - Search with coordinates → Direct API call with location filter
    - Filter by tags → Matches against event tags (Music, Food & Drink, etc.)
  `,
  inputSchema: z.object({
    // Location options (one of these should be provided)
    city: z.string().optional().describe("City name (e.g., 'Bangalore', 'Mumbai')"),
    coordinates: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
      })
      .optional()
      .describe("Exact coordinates for location-based search"),

    // Search parameters
    query: z
      .string()
      .optional()
      .describe("Natural language query for context (used for relevance ranking)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Category/interest tags to filter by (e.g., ['Music', 'Jazz/Blues'])"),

    // Pagination & limits
    radiusKm: z
      .number()
      .default(DEFAULT_RADIUS_KM)
      .describe("Search radius in kilometers (default: 50)"),
    limit: z
      .number()
      .default(DEFAULT_LIMIT)
      .describe("Maximum number of events to return (default: 10)"),
    offset: z.number().default(0).describe("Pagination offset"),

    // Sorting
    sortBy: z
      .enum(["distance", "date", "relevance"])
      .default("distance")
      .describe("Sort order for results"),

    // UTM tracking
    postId: z
      .string()
      .optional()
      .describe("Original post ID for UTM attribution tracking"),
    utmCampaign: z
      .string()
      .optional()
      .describe("Custom UTM campaign name (default: 'happenings_bot')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    events: z.array(EventResult),
    totalFound: z.number(),
    searchParams: z.object({
      coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
      radiusKm: z.number(),
      tagsUsed: z.array(z.string()),
    }),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { city, coordinates, query, tags, radiusKm, limit, offset, sortBy, postId, utmCampaign } = context;

    try {
      // Step 1: Resolve coordinates
      let searchCoords: { lat: number; lng: number } | null = null;

      if (coordinates) {
        searchCoords = { lat: coordinates.latitude, lng: coordinates.longitude };
      } else if (city) {
        // Try quick lookup first
        searchCoords = getQuickCoordinates(city);

        if (!searchCoords) {
          // City not in quick lookup - use Bangalore as fallback with warning
          console.warn(
            `City "${city}" not in quick lookup, falling back to Bangalore coordinates`
          );
          searchCoords = INDIAN_CITY_COORDINATES.bangalore;
        }
      }

      // Step 2: Build API URL
      const apiUrl = new URL(`${HAPPENINGS_API_BASE}/event/all-events`);

      if (searchCoords) {
        apiUrl.searchParams.set("location", JSON.stringify(searchCoords));
        apiUrl.searchParams.set("radius", String(radiusKm));
        apiUrl.searchParams.set("sortBy", sortBy === "distance" ? "distance" : "date");
      }

      // Fetch more events than needed if filtering by tags (we'll filter client-side)
      const tagsToUse = tags || [];
      const fetchLimit = tagsToUse.length > 0 ? Math.max(limit * 5, 50) : limit;
      const actualOffset = offset ?? 0;

      apiUrl.searchParams.set("limit", String(fetchLimit));
      apiUrl.searchParams.set("offset", String(actualOffset));

      // Note: Tags filtering is done client-side as API may not support it
      // The API returns events with: tags[], primaryCategory, secondaryCategory[]

      console.log(`[EventSearch] Fetching: ${apiUrl.toString()}`);

      // Step 3: Fetch from API
      const response = await fetch(apiUrl.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "HappeningsBot/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Happenings API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Step 4: Parse and transform events
      // API returns { events: [...] } with fields: tags[], primaryCategory, secondaryCategory[]
      const rawEvents = Array.isArray(data) ? data : data.events || data.data || [];

      console.log(`[EventSearch] Received ${rawEvents.length} events from API`);

      let events: z.infer<typeof EventResult>[] = rawEvents.map((event: any) => {
        const eventId = event._id || event.id || "";
        return {
          id: eventId,
          name: event.title || event.eventName || event.name || "Unnamed Event",
          description: event.description || "No description available",
          date: event.startAt || event.startDate || event.date || "",
          endDate: event.endAt || event.endDate,
          venue: event.address?.name || event.venue || "Venue TBA",
          address: event.address?.formattedAddress || event.address,
          city: event.address?.city || event.city || city || "Unknown",
          category: event.primaryCategory || event.category || (event.tags?.[0] ?? "General"),
          tags: event.tags || [],
          url: event.url || event.eventUrl || "",
          // Generate Happenings URL with UTM tracking
          happeningsUrl: generateEventUrl(eventId, {
            campaign: utmCampaign || "happenings_bot",
            postId: postId,
            content: event.primaryCategory || "event",
          }),
          price: formatPrice(event.price, event.currency),
          distance: event.distance,
          imageUrl: event.coverImage || event.imageUrl,
        };
      });

      // Step 5: Client-side tag filtering if tags provided
      if (tagsToUse.length > 0) {
        const normalizedTags = tagsToUse.map((t) => t.toLowerCase());
        events = events.filter((event) => {
          // Check if any of the event's tags match any of the filter tags
          const eventTags = event.tags.map((t) => t.toLowerCase());
          const eventCategory = event.category.toLowerCase();

          return (
            normalizedTags.some((filterTag) =>
              eventTags.some((eventTag) => eventTag.includes(filterTag) || filterTag.includes(eventTag))
            ) ||
            normalizedTags.some(
              (filterTag) => eventCategory.includes(filterTag) || filterTag.includes(eventCategory)
            )
          );
        });
        console.log(`[EventSearch] After tag filtering: ${events.length} events match`);
      }

      // Step 6: Optional relevance ranking if query provided
      let rankedEvents = events;
      if (query && events.length > 0) {
        rankedEvents = rankByRelevance(events, query);
      }

      return {
        success: true,
        events: rankedEvents.slice(0, limit),
        totalFound: events.length,
        searchParams: {
          coordinates: searchCoords || undefined,
          radiusKm,
          tagsUsed: tagsToUse,
        },
      };
    } catch (error) {
      console.error("[EventSearch] Error:", error);
      return {
        success: false,
        events: [],
        totalFound: 0,
        searchParams: {
          radiusKm,
          tagsUsed: tags || [],
        },
        error: error instanceof Error ? error.message : "Unknown error fetching events",
      };
    }
  },
});

/**
 * Format price for display
 */
function formatPrice(price: number | undefined, currency?: string): string {
  if (price === undefined || price === null) {
    return "Price TBA";
  }
  if (price === 0) {
    return "Free";
  }

  const currencySymbol = currency === "USD" ? "$" : "₹";
  return `${currencySymbol}${price.toLocaleString()}`;
}

/**
 * Simple relevance ranking based on query keyword matching
 * For better results, use vector embeddings
 */
function rankByRelevance<T extends { name: string; description: string; tags: string[] }>(
  events: T[],
  query: string
): T[] {
  const queryWords = query.toLowerCase().split(/\s+/);

  return [...events].sort((a, b) => {
    const scoreA = calculateRelevanceScore(a, queryWords);
    const scoreB = calculateRelevanceScore(b, queryWords);
    return scoreB - scoreA; // Higher score first
  });
}

function calculateRelevanceScore(
  event: { name: string; description: string; tags: string[] },
  queryWords: string[]
): number {
  let score = 0;
  const name = event.name.toLowerCase();
  const description = event.description.toLowerCase();
  const tags = event.tags.map((t) => t.toLowerCase());

  for (const word of queryWords) {
    if (word.length < 3) continue; // Skip short words

    // Name match (highest weight)
    if (name.includes(word)) score += 3;

    // Tag match (high weight)
    if (tags.some((t) => t.includes(word))) score += 2;

    // Description match (lower weight)
    if (description.includes(word)) score += 1;
  }

  return score;
}

/**
 * Export types for use in other modules
 */
export type { z as EventSearchSchema };
