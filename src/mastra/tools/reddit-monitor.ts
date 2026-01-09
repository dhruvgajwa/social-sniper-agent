import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import Snoowrap from "snoowrap";
import fs from "fs";
import path from "path";

/**
 * Reddit Mention Schema
 * 
 * Represents a mention of the bot (u/Happenings_bot) in posts or comments.
 * The bot reacts to mentions rather than scraping subreddits.
 */
const RedditMention = z.object({
  id: z.string(),
  type: z.enum(["post", "comment"]).describe("Whether this is a post or comment mention"),
  title: z.string().optional().describe("Title of the post (if type=post) or parent post title"),
  body: z.string().describe("The text content containing the mention"),
  author: z.string(),
  subreddit: z.string(),
  created_utc: z.number(),
  permalink: z.string(),
  parentId: z.string().optional().describe("Parent post/comment ID for replies"),
  context: z.string().optional().describe("Additional context from parent post if available"),
  metadata: z
    .object({
      intent: z.number().min(0).max(1).optional(),
      source: z.string().optional(),
    })
    .optional(),
});

export const redditMonitorTool = createTool({
  id: "reddit-monitor",
  description: `
    Fetches mentions of the Happenings bot (u/Happenings_bot) from Reddit inbox.
    Reacts to users who explicitly mention the bot for event recommendations.
    Filters mentions to those less than 2 hours old to ensure freshness.
    Returns mentions with text content, author, subreddit, and metadata for downstream processing.
  `,
  inputSchema: z.object({
    botUsername: z
      .string()
      .default("Happenings_bot")
      .describe("The bot's Reddit username to fetch mentions for"),
    maxMentions: z.number().default(25).describe("Maximum number of mentions to fetch"),
    freshnessHours: z.number().default(2).describe("Only return mentions newer than this many hours"),
    markAsRead: z.boolean().default(false).describe("Whether to mark fetched mentions as read"),
  }),
  outputSchema: z.object({
    mentions: z.array(RedditMention),
    totalFetched: z.number(),
    unreadCount: z.number().describe("Number of unread mentions in inbox"),
  }),
  execute: async ({ context }) => {
    const { botUsername, maxMentions, freshnessHours, markAsRead } = context;

    // If test dataset flag set, load local JSON instead of calling Reddit API
    const useTest = process.env.USE_TEST_DATA_REDDIT === "true";

    if (useTest) {
      try {
        const testFile = path.join(process.cwd(), "src", "test-data", "reddit_mentions_test.json");

        // Fall back to old test file format if new one doesn't exist
        let raw: string;
        let items: any[];

        if (fs.existsSync(testFile)) {
          raw = fs.readFileSync(testFile, "utf-8");
          items = JSON.parse(raw) as any[];
        } else {
          // Convert old post format to mention format for backwards compatibility
          const oldTestFile = path.join(process.cwd(), "src", "test-data", "reddit_test_posts.json");
          raw = fs.readFileSync(oldTestFile, "utf-8");
          const oldItems = JSON.parse(raw) as any[];
          items = oldItems.map((post) => ({
            id: post.id,
            type: "post" as const,
            title: post.title,
            body: `${post.title}\n\n${post.selftext}`,
            author: post.author,
            subreddit: post.subreddit,
            created_utc: post.created_utc,
            permalink: post.permalink,
            metadata: post.metadata,
          }));
        }

        // Filter by freshness
        const cutoffTime = Math.floor(Date.now() / 1000) - (freshnessHours || 2) * 60 * 60;

        const filtered = items
          .filter((m) => (m.created_utc || 0) > cutoffTime)
          .slice(0, maxMentions || 25)
          .map((mention) => ({
            id: mention.id,
            type: mention.type || "comment",
            title: mention.title,
            body: mention.body,
            author: mention.author,
            subreddit: mention.subreddit,
            created_utc: mention.created_utc,
            permalink: mention.permalink,
            parentId: mention.parentId,
            context: mention.context,
            metadata: mention.metadata,
          }));

        return { mentions: filtered, totalFetched: filtered.length, unreadCount: filtered.length };
      } catch (err) {
        console.error("Failed to load reddit test data:", err);
        return { mentions: [], totalFetched: 0, unreadCount: 0 };
      }
    }

    // Validate credentials for authenticated access
    if (!process.env.REDDIT_USERNAME || !process.env.REDDIT_PASSWORD) {
      throw new Error(
        "Reddit mentions require REDDIT_USERNAME and REDDIT_PASSWORD environment variables. " +
        "The bot needs to be authenticated to read its inbox."
      );
    }

    const reddit = new Snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT || "Happenings Event Bot v1.0 (by /u/Happenings_bot)",
      clientId: process.env.REDDIT_CLIENT_ID!,
      clientSecret: process.env.REDDIT_CLIENT_SECRET!,
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD,
    });

    const cutoffTime = Math.floor(Date.now() / 1000) - freshnessHours * 60 * 60;
    const allMentions: any[] = [];

    try {
      // Fetch unread messages from inbox (includes mentions)
      // @ts-ignore - Snoowrap types can be incomplete
      const inbox = await reddit.getUnreadMessages({ limit: maxMentions });

      // Filter for username mentions only
      const mentions = inbox.filter((item: any) => {
        // Check if this is a username mention
        const isMention = item.subject === "username mention" ||
          item.was_comment === true ||
          (item.body && item.body.toLowerCase().includes(`u/${botUsername.toLowerCase()}`));

        // Check freshness
        const isFresh = item.created_utc > cutoffTime;

        return isMention && isFresh;
      });

      for (const mention of mentions) {
        // Cast to any to access Reddit-specific properties that may not be in PrivateMessage type
        const msg = mention as any;

        // Determine if this is a comment or post mention
        const isComment = msg.was_comment === true || msg.name?.startsWith("t1_");

        let parentContext = "";
        let parentTitle = "";

        // Try to get parent post context for comments
        if (isComment && msg.link_id) {
          try {
            const postId = String(msg.link_id).replace("t3_", "");
            // @ts-ignore - Snoowrap has circular type reference issue
            const parentPost = await reddit.getSubmission(postId).fetch();
            parentTitle = parentPost.title || "";
            parentContext = `${parentPost.title || ""}\n\n${parentPost.selftext || ""}`.slice(0, 500);
          } catch (e) {
            // Parent context is optional, continue without it
          }
        }

        allMentions.push({
          id: msg.id,
          type: isComment ? "comment" : "post",
          title: parentTitle || msg.link_title || "",
          body: msg.body || "",
          author: msg.author?.name || msg.author || "",
          subreddit: msg.subreddit?.display_name || msg.subreddit_name_prefixed?.replace("r/", "") || "",
          created_utc: msg.created_utc,
          permalink: msg.permalink || `/comments/${msg.link_id?.replace("t3_", "")}/-/${msg.id}`,
          parentId: msg.parent_id || msg.link_id,
          context: parentContext,
        });

        // Mark as read if requested
        if (markAsRead) {
          try {
            await msg.markAsRead();
          } catch (e) {
            console.warn(`Failed to mark mention ${msg.id} as read:`, e);
          }
        }
      }

      // Get total unread count
      const unreadCount = inbox.length;

      console.log(`📬 Fetched ${allMentions.length} fresh mentions for u/${botUsername}`);

      return {
        mentions: allMentions,
        totalFetched: allMentions.length,
        unreadCount,
      };
    } catch (error: any) {
      console.error(`Error fetching mentions for u/${botUsername}:`, error.message);
      throw new Error(`Failed to fetch Reddit mentions: ${error.message}`);
    }
  },
});
