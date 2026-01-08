import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import Snoowrap from "snoowrap";

const SubredditPost = z.object({
  id: z.string(),
  title: z.string(),
  selftext: z.string(),
  author: z.string(),
  subreddit: z.string(),
  created_utc: z.number(),
  permalink: z.string(),
  url: z.string(),
  score: z.number(),
});

export const redditMonitorTool = createTool({
  id: "reddit-monitor",
  description: `
    Monitors specific Indian city subreddits for fresh posts expressing boredom or planning intent.
    Filters posts to those less than 2 hours old to ensure freshness.
    Returns posts with title, text content, author, and metadata for downstream processing.
  `,
  inputSchema: z.object({
    subreddits: z
      .array(z.string())
      .describe("List of subreddit names to monitor (e.g., ['bangalore', 'mumbai'])"),
    maxPosts: z.number().default(20).describe("Maximum number of posts to fetch per subreddit"),
    freshnessHours: z.number().default(2).describe("Only return posts newer than this many hours"),
  }),
  outputSchema: z.object({
    posts: z.array(SubredditPost),
    totalFetched: z.number(),
  }),
  execute: async ({ context }) => {
    const { subreddits, maxPosts, freshnessHours } = context;

    const reddit = new Snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT || "EventHive Social Sniper Bot v1.0",
      clientId: process.env.REDDIT_CLIENT_ID!,
      clientSecret: process.env.REDDIT_CLIENT_SECRET!,
      username: "", // Read-only, no posting
      password: "", // Read-only, no posting
    });

    const cutoffTime = Math.floor(Date.now() / 1000) - freshnessHours * 60 * 60;
    const allPosts: any[] = [];

    for (const subredditName of subreddits) {
      try {
        const subreddit = reddit.getSubreddit(subredditName);
        const newPosts = await subreddit.getNew({ limit: maxPosts });

        const freshPosts = newPosts
          .filter((post: any) => post.created_utc > cutoffTime)
          .map((post: any) => ({
            id: post.id,
            title: post.title,
            selftext: post.selftext,
            author: post.author.name,
            subreddit: post.subreddit.display_name,
            created_utc: post.created_utc,
            permalink: post.permalink,
            url: post.url,
            score: post.score,
          }));

        allPosts.push(...freshPosts);
      } catch (error) {
        console.error(`Error fetching from r/${subredditName}:`, error);
      }
    }

    return {
      posts: allPosts,
      totalFetched: allPosts.length,
    };
  },
});
