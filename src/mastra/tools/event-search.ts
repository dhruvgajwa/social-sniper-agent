import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const EventResult = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  date: z.string(),
  location: z.string(),
  city: z.string(),
  category: z.string(),
  url: z.string(),
  price: z.string().optional(),
});

export const eventSearchTool = createTool({
  id: "event-search",
  description: `
    Performs semantic search on the Happenings database to find relevant events.
    Takes user context (city, vibe, budget) and returns matching events.
    This is the RAG retrieval component that queries the event database.
  `,
  inputSchema: z.object({
    city: z.string().describe("City where events should be located"),
    query: z.string().describe("Natural language description of what the user is looking for"),
    maxResults: z.number().default(3).describe("Maximum number of events to return"),
    date: z
      .string()
      .optional()
      .describe("Specific date or date range (e.g., 'this weekend', 'today')"),
    category: z
      .string()
      .optional()
      .describe("Event category filter (e.g., 'music', 'food', 'tech')"),
  }),
  outputSchema: z.object({
    events: z.array(EventResult),
    totalFound: z.number(),
  }),
  execute: async ({ context }) => {
    const { city, query, maxResults, date, category } = context;

    // TODO: Replace with actual Happenings database connection
    // This is a placeholder that would connect to your MongoDB or API

    try {
      // Example: Connect to Happenings database
      const dbUrl = process.env.HAPPENINGS_DB_URL;

      // Simulate semantic search
      // In production, this would use vector embeddings with a service like:
      // - OpenAI Embeddings + Vector DB (Pinecone, Weaviate, etc.)
      // - MongoDB Atlas Search
      // - Elasticsearch

      // Mock data for demonstration
      const mockEvents = [
        {
          id: "evt_123",
          name: "Live Jazz Night at Blue Frog",
          description: "Smooth jazz evening with local artists",
          date: "2024-01-20",
          location: "Indiranagar",
          city: city,
          category: "music",
          url: "https://happenings.com/events/evt_123",
          price: "₹500",
        },
        {
          id: "evt_124",
          name: "Street Food Festival",
          description: "Explore authentic local street food",
          date: "2024-01-21",
          location: "Koramangala",
          city: city,
          category: "food",
          url: "https://happenings.com/events/evt_124",
          price: "Free",
        },
        {
          id: "evt_125",
          name: "Startup Networking Mixer",
          description: "Connect with fellow entrepreneurs",
          date: "2024-01-22",
          location: "HSR Layout",
          city: city,
          category: "networking",
          url: "https://happenings.com/events/evt_125",
          price: "₹300",
        },
      ];

      // Apply filters
      let filteredEvents = mockEvents.filter((e) => e.city.toLowerCase() === city.toLowerCase());

      if (category) {
        filteredEvents = filteredEvents.filter(
          (e) => e.category.toLowerCase() === category.toLowerCase()
        );
      }

      // Limit results
      const events = filteredEvents.slice(0, maxResults);

      return {
        events,
        totalFound: filteredEvents.length,
      };
    } catch (error) {
      console.error("Error searching events:", error);
      return {
        events: [],
        totalFound: 0,
      };
    }
  },
});
