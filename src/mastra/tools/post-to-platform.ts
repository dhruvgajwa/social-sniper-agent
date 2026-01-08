import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import Snoowrap from "snoowrap";
import { TwitterApi } from "twitter-api-v2";

/**
 * Post-to-Platform Tool
 *
 * Posts approved responses to Reddit or Twitter.
 * Handles both platforms with appropriate API clients.
 */
export const postToPlatformTool = createTool({
  id: "post-to-platform",
  description: `
    Posts an approved response to Reddit or Twitter.
    For Reddit: Posts as a comment reply to a submission.
    For Twitter: Posts as a reply tweet to an existing tweet.
    Returns the posted comment/reply ID and URL for tracking.
  `,
  inputSchema: z.object({
    platform: z.enum(["reddit", "twitter"]).describe("Platform to post to"),
    postId: z.string().describe("ID of the post/tweet to reply to"),
    message: z.string().describe("The message to post as a reply"),
  }),
  outputSchema: z.object({
    posted: z.boolean().describe("Whether the post was successful"),
    postedId: z.string().optional().describe("ID of the posted comment/reply"),
    postedUrl: z.string().optional().describe("URL to the posted comment/reply"),
    error: z.string().optional().describe("Error message if posting failed"),
  }),
  execute: async ({ context }) => {
    const { platform, postId, message } = context;

    try {
      if (platform === "reddit") {
        return await postToReddit(postId, message);
      } else {
        return await postToTwitter(postId, message);
      }
    } catch (error: any) {
      console.error(`❌ Error posting to ${platform}:`, error);
      return {
        posted: false,
        error: error.message || String(error),
      };
    }
  },
});

/**
 * Post a comment to a Reddit submission
 */
async function postToReddit(
  postId: string,
  message: string
): Promise<{ posted: boolean; postedId?: string; postedUrl?: string; error?: string }> {
  // Validate credentials
  if (!process.env.REDDIT_USERNAME || !process.env.REDDIT_PASSWORD) {
    throw new Error(
      "Reddit posting requires REDDIT_USERNAME and REDDIT_PASSWORD environment variables"
    );
  }

  try {
    const reddit = new Snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT || "EventHive Social Sniper Bot v1.0",
      clientId: process.env.REDDIT_CLIENT_ID!,
      clientSecret: process.env.REDDIT_CLIENT_SECRET!,
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD,
    });

    // Get the submission (post) and post a comment
    const submission = reddit.getSubmission(postId);
    // @ts-ignore - Snoowrap has circular type reference issue
    const comment = await submission.reply(message);

    console.log(`✅ Posted Reddit comment: https://reddit.com${comment.permalink}`);

    return {
      posted: true,
      postedId: comment.id,
      postedUrl: `https://reddit.com${comment.permalink}`,
    };
  } catch (error: any) {
    console.error(`❌ Failed to post to Reddit:`, error.message);
    return {
      posted: false,
      error: error.message,
    };
  }
}

/**
 * Post a reply to a Twitter tweet
 */
async function postToTwitter(
  tweetId: string,
  message: string
): Promise<{ posted: boolean; postedId?: string; postedUrl?: string; error?: string }> {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
  });

  // Post the reply tweet
  const result = await client.v2.reply(message, tweetId);

  const tweetUrl = `https://twitter.com/i/web/status/${result.data.id}`;
  console.log(`✅ Posted Twitter reply: ${tweetUrl}`);

  return {
    posted: true,
    postedId: result.data.id,
    postedUrl: tweetUrl,
  };
}
