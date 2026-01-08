import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { redditMonitorTool } from "../tools/reddit-monitor";
import { twitterMonitorTool } from "../tools/twitter-monitor";
import { notificationTool } from "../tools/notification";
import { postToPlatformTool } from "../tools/post-to-platform";

/**
 * Social Sniper Pipeline Workflow
 *
 * Orchestrates the complete flow:
 * 1. Ingest posts from Reddit/Twitter
 * 2. Classify intent (high vs low)
 * 3. Extract context (location, vibe, etc.)
 * 4. Search for matching events (RAG)
 * 5. Generate response draft
 * 6. Send for human approval
 */

const SocialPost = z.object({
  id: z.string(),
  platform: z.enum(["reddit", "twitter"]),
  text: z.string(),
  author: z.string(),
  url: z.string(),
  createdAt: z.string(),
});

const HighIntentPost = SocialPost.extend({
  intentScore: z.number(),
  reasoning: z.string(),
  context: z
    .object({
      location: z.string().optional(),
      vibe: z.string().optional(),
      budget: z.string().optional(),
      timeframe: z.string().optional(),
    })
    .optional(),
});

// Step 1: Fetch posts from social platforms
const fetchPostsStep = createStep({
  id: "fetch-posts",
  description: "Monitors Reddit and Twitter for fresh posts",
  inputSchema: z.object({
    platforms: z.array(z.enum(["reddit", "twitter"])),
    cities: z.array(z.string()),
  }),
  outputSchema: z.object({
    posts: z.array(SocialPost),
    totalFetched: z.number(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { platforms, cities } = inputData;
    const allPosts: any[] = [];

    // Fetch from Reddit
    if (platforms.includes("reddit")) {
      const subreddits = cities.map((city) => city.toLowerCase());

      const redditResult = await redditMonitorTool.execute({
        context: {
          subreddits,
          maxPosts: 20,
          freshnessHours: 2,
        },
        runtimeContext,
      });

      const redditPosts = (redditResult?.posts || []).map((post: any) => ({
        id: post.id,
        platform: "reddit" as const,
        text: `${post.title}\n\n${post.selftext}`,
        author: post.author,
        url: `https://reddit.com${post.permalink}`,
        createdAt: new Date((post.created_utc || Date.now() / 1000) * 1000).toISOString(),
      }));

      allPosts.push(...redditPosts);
    }

    // Fetch from Twitter
    if (platforms.includes("twitter")) {
      const twitterResult = await twitterMonitorTool.execute({
        context: {
          cities,
          keywords: cities.map((c: string) => c.toLowerCase()),
          maxTweets: 20,
          freshnessHours: 2,
        },
        runtimeContext,
      });

      const tweets = (twitterResult?.tweets || []).map((tweet: any) => ({
        id: tweet.id,
        platform: "twitter" as const,
        text: tweet.text,
        author: tweet.author_username || tweet.author_id,
        url: `https://twitter.com/i/web/status/${tweet.id}`,
        createdAt: tweet.created_at,
      }));

      allPosts.push(...tweets);
    }

    return {
      posts: allPosts,
      totalFetched: allPosts.length,
    };
  },
});

// Step 2: Classify intent for each post
const classifyIntentStep = createStep({
  id: "classify-intent",
  description: "Analyzes posts to detect high-intent planning signals",
  inputSchema: z.object({
    posts: z.array(SocialPost),
  }),
  outputSchema: z.object({
    highIntentPosts: z.array(
      SocialPost.extend({
        intentScore: z.number(),
        reasoning: z.string(),
        context: z.object({
          location: z.string().optional(),
          vibe: z.string().optional(),
          budget: z.string().optional(),
          timeframe: z.string().optional(),
        }),
      })
    ),
    totalProcessed: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { posts } = inputData;
    const intentAgent = mastra.getAgent("intentClassifierAgent");
    const highIntentPosts: any[] = [];

    const intentThreshold = parseFloat(process.env.INTENT_THRESHOLD || "0.8");

    for (const post of posts) {
      const result = await intentAgent.generate(`Analyze this post:\n\n${post.text}`, {
        structuredOutput: {
          schema: z.object({
            intent: z.enum(["high", "low"]).describe("Classification result"),
            confidence: z.number().min(0).max(1).describe("Confidence score (0-1)"),
            reasoning: z.string().describe("Brief explanation of the classification"),
            context: z.object({
              location: z.string().optional().describe("Detected city or neighborhood"),
              vibe: z.string().optional().describe("Inferred mood or preference"),
              budget: z.string().optional().describe("Budget hints if mentioned"),
              timeframe: z.string().optional().describe("When they want to do something"),
            }),
          }),
        },
      });

      // Structured output is returned on result.object
      const classification = result.object;
      if (!classification) continue;

      const { intent, confidence, reasoning, context } = classification;

      if (intent === "high" && confidence >= intentThreshold) {
        highIntentPosts.push({
          ...post,
          intentScore: confidence,
          reasoning,
          context,
        });
      }
    }

    return {
      highIntentPosts,
      totalProcessed: posts.length,
    };
  },
});

// Step 3: Find matching events for each high-intent post
const findEventsStep = createStep({
  id: "find-events",
  description: "Searches EventHive database for relevant events",
  inputSchema: z.object({
    highIntentPosts: z.array(HighIntentPost),
  }),
  outputSchema: z.object({
    postsWithEvents: z.array(
      HighIntentPost.extend({
        recommendations: z.string().optional(),
      })
    ),
    totalMatched: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { highIntentPosts } = inputData;
    const eventAgent = mastra.getAgent("eventRecommenderAgent");
    const postsWithEvents: any[] = [];

    for (const post of highIntentPosts) {
      const context = post.context ?? {};

      const query = `
User post: ${post.text}

Context:
- Location: ${context.location || "not specified"}
- Vibe: ${context.vibe || "not specified"}
- Budget: ${context.budget || "not specified"}
- Timeframe: ${context.timeframe || "not specified"}

Find the best matching events.
      `.trim();

      try {
        const result = await eventAgent.generate(query);

        postsWithEvents.push({
          ...post,
          recommendations: result.text || "",
        });
      } catch (err) {
        postsWithEvents.push({
          ...post,
          recommendations: "",
        });
      }
    }

    return {
      postsWithEvents,
      totalMatched: postsWithEvents.length,
    };
  },
});

// Step 4: Generate response drafts
const generateResponseStep = createStep({
  id: "generate-response",
  description: "Crafts personalized responses for each post",
  inputSchema: z.object({
    postsWithEvents: z.array(HighIntentPost.extend({ recommendations: z.string().optional() })),
  }),
  outputSchema: z.object({
    drafts: z.array(
      z.object({
        post: z.any(),
        draftResponse: z.string(),
      })
    ),
    totalDrafts: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { postsWithEvents } = inputData;
    const responseAgent = mastra.getAgent("responseWriterAgent");
    const drafts: any[] = [];

    for (const post of postsWithEvents) {
      const prompt = `
Original Post:
${post.text}

Detected Context:
- Location: ${post.context?.location || "not specified"}
- Vibe: ${post.context?.vibe || "not specified"}
- Timeframe: ${post.context?.timeframe || "not specified"}

Event Recommendations:
${post.recommendations ?? ""}

Write a response following the tone and structure guidelines.
      `.trim();

      try {
        const result = await responseAgent.generate(prompt);

        drafts.push({
          post,
          draftResponse: result.text || "",
        });
      } catch (err) {
        drafts.push({ post, draftResponse: "" });
      }
    }

    return {
      drafts,
      totalDrafts: drafts.length,
    };
  },
});

// Step 5: Send for human approval
const sendForApprovalStep = createStep({
  id: "send-approval",
  description: "Sends draft responses to Telegram/Slack for human review",
  inputSchema: z.object({
    drafts: z.array(
      z.object({
        post: z.any(),
        draftResponse: z.string(),
      })
    ),
    totalDrafts: z.number(),
  }),
  outputSchema: z.object({
    sentNotifications: z.number(),
    pendingApproval: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { drafts } = inputData;
    const pendingApproval: string[] = [];

    // Get notification platform from environment variable
    const notificationChannel = process.env.APPROVAL_NOTIFICATION_CHANNEL || "telegram";
    const notificationPlatform = notificationChannel as "telegram" | "slack";

    console.log(
      `\n👤 MANUAL APPROVAL MODE: Sending ${drafts.length} drafts to ${notificationPlatform}...\n`
    );

    for (const draft of drafts) {
      try {
        const result = await notificationTool.execute({
          context: {
            platform: notificationPlatform,
            draftResponse: String(draft.draftResponse || ""),
            sourcePost: {
              platform: String(draft.post?.platform || ""),
              postId: String(draft.post?.id || ""),
              author: String(draft.post?.author || ""),
              text: String(draft.post?.text || ""),
              url: String(draft.post?.url || ""),
            },
            recommendedEvents: draft.post?.recommendations
              ? [String(draft.post.recommendations)]
              : [],
          },
          runtimeContext,
        });

        if (result?.sent) {
          pendingApproval.push(String(draft.post?.id || ""));
          console.log(`  ✅ Sent notification for ${draft.post?.platform} post: ${draft.post?.id}`);
        }
      } catch (err) {
        console.error(`  ❌ Failed to send notification: ${err}`);
        continue;
      }
    }

    return {
      sentNotifications: pendingApproval.length,
      pendingApproval,
    };
  },
});

// Step 6: Auto-Post (when AUTO_APPROVE=true)
const autoPostStep = createStep({
  id: "auto-post",
  description: "Automatically posts approved responses to Reddit/Twitter",
  inputSchema: z.object({
    drafts: z.array(
      z.object({
        post: z.any(),
        draftResponse: z.string(),
      })
    ),
    totalDrafts: z.number(),
  }),
  outputSchema: z.object({
    posted: z.array(z.string()),
    failed: z.array(z.string()),
    totalPosted: z.number(),
    postedUrls: z.array(z.string()),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const { drafts } = inputData;
    const posted: string[] = [];
    const failed: string[] = [];
    const postedUrls: string[] = [];

    console.log(`\n🤖 AUTO-APPROVE MODE: Posting ${drafts.length} responses...\n`);

    for (const draft of drafts) {
      try {
        const result = await postToPlatformTool.execute({
          context: {
            platform: draft.post.platform,
            postId: draft.post.id,
            message: draft.draftResponse,
          },
          runtimeContext,
        });

        if (result.posted) {
          posted.push(draft.post.id);
          postedUrls.push(result.postedUrl || "");
          console.log(`  ✅ Posted to ${draft.post.platform}: ${result.postedUrl}`);
        } else {
          failed.push(draft.post.id);
          console.error(`  ❌ Failed to post to ${draft.post.platform}: ${result.error}`);
        }
      } catch (err: any) {
        failed.push(draft.post.id);
        console.error(`  ❌ Error posting to ${draft.post.platform}:`, err.message);
      }
    }

    console.log(`\n📊 Auto-post results: ${posted.length} posted, ${failed.length} failed\n`);

    return {
      posted,
      failed,
      totalPosted: posted.length,
      postedUrls,
    };
  },
});

// Compose the full workflow
export const socialSniperWorkflow = createWorkflow({
  id: "social-sniper-pipeline",
  description: "Complete autonomous pipeline for social listening and engagement",
  inputSchema: z.object({
    platforms: z.array(z.enum(["reddit", "twitter"])).default(["reddit", "twitter"]),
    cities: z.array(z.string()).default(["Bangalore", "Mumbai", "Delhi", "Pune", "Hyderabad"]),
  }),
  outputSchema: z.object({
    totalProcessed: z.number(),
    highIntentDetected: z.number(),
    autoApproved: z.boolean(),
    draftsSent: z.number().optional(),
    pendingApproval: z.array(z.string()).optional(),
    posted: z.array(z.string()).optional(),
    totalPosted: z.number().optional(),
    postedUrls: z.array(z.string()).optional(),
  }),
})
  .then(fetchPostsStep)
  .then(classifyIntentStep)
  .then(findEventsStep)
  .then(generateResponseStep)
  .branch([
    // Branch 1: AUTO_APPROVE=true → Auto-post directly
    [async () => process.env.AUTO_APPROVE === "true", autoPostStep],
    // Branch 2: AUTO_APPROVE=false → Send for human approval
    [async () => process.env.AUTO_APPROVE !== "true", sendForApprovalStep],
  ])
  .map(async ({ inputData }) => {
    const autoApproved = process.env.AUTO_APPROVE === "true";

    if (autoApproved) {
      // Auto-approve branch output - access via step ID
      const autoPostResult = (inputData as any)["auto-post"];
      return {
        totalProcessed: autoPostResult?.posted?.length || 0,
        highIntentDetected: autoPostResult?.posted?.length || 0,
        autoApproved: true,
        posted: autoPostResult?.posted,
        totalPosted: autoPostResult?.totalPosted,
        postedUrls: autoPostResult?.postedUrls,
      };
    } else {
      // Manual approval branch output - access via step ID
      const approvalResult = (inputData as any)["send-approval"];
      return {
        totalProcessed: approvalResult?.pendingApproval?.length || 0,
        highIntentDetected: approvalResult?.pendingApproval?.length || 0,
        autoApproved: false,
        draftsSent: approvalResult?.sentNotifications,
        pendingApproval: approvalResult?.pendingApproval,
      };
    }
  })
  .commit();
