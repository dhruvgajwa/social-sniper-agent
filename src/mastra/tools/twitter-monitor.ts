import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { TwitterApi } from "twitter-api-v2";

const Tweet = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string(),
  author_username: z.string().optional(),
  created_at: z.string(),
  location: z.string().optional(),
  public_metrics: z
    .object({
      retweet_count: z.number(),
      reply_count: z.number(),
      like_count: z.number(),
    })
    .optional(),
});

export const twitterMonitorTool = createTool({
  id: "twitter-monitor",
  description: `
    Monitors Twitter/X for geo-tagged tweets in target Indian cities expressing boredom or planning intent.
    Uses location filters and keywords to find relevant tweets.
    Returns tweets with text, author info, and engagement metrics.
  `,
  inputSchema: z.object({
    cities: z
      .array(z.string())
      .describe("List of cities to monitor (e.g., ['Bangalore', 'Mumbai'])"),
    keywords: z
      .array(z.string())
      .default(["bored", "nothing to do", "weekend plans", "what to do", "looking for"])
      .describe("Keywords to search for in tweets"),
    maxTweets: z.number().default(20).describe("Maximum number of tweets to fetch"),
    freshnessHours: z.number().default(2).describe("Only return tweets newer than this many hours"),
  }),
  outputSchema: z.object({
    tweets: z.array(Tweet),
    totalFetched: z.number(),
  }),
  execute: async ({ context }) => {
    const { cities, keywords, maxTweets, freshnessHours } = context;

    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

    const readOnlyClient = client.readOnly;

    const cutoffTime = new Date(Date.now() - freshnessHours * 60 * 60 * 1000);
    const allTweets: any[] = [];

    // Build search query
    const keywordQuery = keywords.map((kw) => `"${kw}"`).join(" OR ");
    const cityQuery = cities.map((city) => `near:"${city}, India"`).join(" OR ");

    const searchQuery = `(${keywordQuery}) (${cityQuery}) -is:retweet lang:en`;

    try {
      const tweets = await readOnlyClient.v2.search(searchQuery, {
        max_results: maxTweets,
        "tweet.fields": ["created_at", "public_metrics", "author_id", "geo"],
        "user.fields": ["username"],
        expansions: ["author_id"],
      });

      for (const tweet of tweets.data.data || []) {
        const createdAt = new Date(tweet.created_at!);
        if (createdAt < cutoffTime) continue;

        // Find author username from includes
        const author = tweets.data.includes?.users?.find((u) => u.id === tweet.author_id);

        allTweets.push({
          id: tweet.id,
          text: tweet.text,
          author_id: tweet.author_id!,
          author_username: author?.username,
          created_at: tweet.created_at!,
          location: tweet.geo?.place_id,
          public_metrics: tweet.public_metrics,
        });
      }
    } catch (error) {
      console.error("Error fetching tweets:", error);
    }

    return {
      tweets: allTweets,
      totalFetched: allTweets.length,
    };
  },
});
