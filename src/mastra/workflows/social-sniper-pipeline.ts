import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { redditMonitorTool } from "../tools/reddit-monitor";
import { notificationTool } from "../tools/notification";
import { postToPlatformTool } from "../tools/post-to-platform";

/**
 * Social Sniper Pipeline Workflow (Mentions-Based)
 *
 * Orchestrates the complete flow for responding to bot mentions:
 * 1. Fetch mentions of u/Happenings_bot from Reddit inbox
 * 2. Classify intent (high vs low) - filter genuine event searches
 * 3. Find matching events using independent event recommender
 * 4. Generate response draft with Happenings URLs
 * 5. Send for human approval (or auto-post if enabled)
 *
 * REFACTORED:
 * - Intent classifier focuses on intent only (no vibe/context extraction)
 * - Event recommender works independently with just the post text
 * - Response writer uses Happenings URLs as event title hrefs
 * 
 * NOTE: This bot reacts to mentions only - it does NOT crawl/scrape subreddits.
 * Users explicitly invoke the bot by mentioning u/Happenings_bot in their posts/comments.
 */

export const SocialPost = z.object({
  id: z.string(),
  platform: z.enum(["reddit", "twitter"]),
  text: z.string(),
  author: z.string(),
  url: z.string(),
  createdAt: z.string(),
  parentContext: z.string().optional().describe("Context from parent post if this is a comment mention"),
});

// REFACTORED: Simplified schema - no longer includes context extraction
// The event recommender extracts context independently from the post text
const HighIntentPost = SocialPost.extend({
  intentScore: z.number(),
  reasoning: z.string(),
  evidence: z.array(z.string()).optional().describe("Key phrases indicating intent"),
});

// Step 1: Fetch mentions from Reddit inbox
const fetchMentionsStep = createStep({
  id: "fetch-mentions",
  description: "Fetches mentions of u/Happenings_bot from Reddit inbox",
  inputSchema: z.object({
    botUsername: z.string().default("Happenings_bot"),
    maxMentions: z.number().default(25),
    freshnessHours: z.number().default(2),
    markAsRead: z.boolean().default(false),
  }),
  outputSchema: z.object({
    posts: z.array(SocialPost),
    totalFetched: z.number(),
    unreadCount: z.number(),
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { botUsername, maxMentions, freshnessHours, markAsRead } = inputData;
    const allPosts: any[] = [];
    const logger = mastra?.getLogger();
    const startTime = Date.now();

    logger?.info("fetch-mentions-started", {
      botUsername,
      maxMentions,
      freshnessHours,
      markAsRead,
    });

    // Fetch mentions from Reddit
    const mentionResult = await redditMonitorTool.execute({
      context: {
        botUsername,
        maxMentions,
        freshnessHours,
        markAsRead,
      },
      runtimeContext,
    });

    const mentions = mentionResult?.mentions || [];

    // Convert mentions to SocialPost format
    const redditPosts = mentions.map((mention: any) => {
      // Combine body with parent context for better understanding
      let fullText = mention.body || "";
      if (mention.context) {
        fullText = `[Parent Post Context]\n${mention.context}\n\n[User's Message]\n${fullText}`;
      } else if (mention.title) {
        fullText = `[Post Title: ${mention.title}]\n\n${fullText}`;
      }

      return {
        id: mention.id,
        platform: "reddit" as const,
        text: fullText,
        author: mention.author,
        url: `https://reddit.com${mention.permalink}`,
        createdAt: new Date((mention.created_utc || Date.now() / 1000) * 1000).toISOString(),
        parentContext: mention.context,
      };
    });

    allPosts.push(...redditPosts);

    const latencyMs = Date.now() - startTime;
    logger?.info("fetch-mentions-completed", {
      botUsername,
      totalFetched: allPosts.length,
      unreadCount: mentionResult?.unreadCount || 0,
      latencyMs,
    });

    console.log(`📬 Fetched ${allPosts.length} mentions for u/${botUsername}`);

    return {
      posts: allPosts,
      totalFetched: allPosts.length,
      unreadCount: mentionResult?.unreadCount || 0,
    };
  },
});

// Step 2: Classify intent for each post
// REFACTORED: Simplified output - only intent, confidence, reasoning, evidence
// No longer extracts location/vibe/budget - that's the event recommender's job
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
        evidence: z.array(z.string()).describe("Key phrases indicating intent"),
      })
    ),
    totalProcessed: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { posts } = inputData;
    const intentAgent = mastra.getAgent("intentClassifierAgent");
    const highIntentPosts: any[] = [];
    const logger = mastra?.getLogger();
    const startTime = Date.now();

    const intentThreshold = parseFloat(process.env.INTENT_THRESHOLD || "0.8");

    logger?.info("classify-intent-started", {
      totalPosts: posts.length,
      intentThreshold,
    });

    for (const post of posts) {
      const classifyStart = Date.now();

      const result = await intentAgent.generate(`Analyze this post:\n\n${post.text}`, {
        structuredOutput: {
          schema: z.object({
            intent: z.enum(["HIGH", "LOW"]).describe("Classification result"),
            confidence: z.number().min(0).max(1).describe("Confidence score (0-1)"),
            reasoning: z.string().describe("Brief explanation of the classification"),
            evidence: z.array(z.string()).describe("Key phrases/signals that indicate the intent"),
          }),
        },
      });

      // Structured output is returned on result.object
      const classification = result.object;
      if (!classification) continue;

      const { intent, confidence, reasoning, evidence } = classification;

      // Log each classification result
      logger?.info("post-classified", {
        postId: post.id,
        platform: post.platform,
        intent,
        confidence,
        reasoning,
        isHighIntent: intent === "HIGH" && confidence >= intentThreshold,
        latencyMs: Date.now() - classifyStart,
      });

      if (intent === "HIGH" && confidence >= intentThreshold) {
        highIntentPosts.push({
          ...post,
          intentScore: confidence,
          reasoning,
          evidence: evidence || [],
        });
      }
    }

    logger?.info("classify-intent-completed", {
      totalProcessed: posts.length,
      highIntentCount: highIntentPosts.length,
      lowIntentCount: posts.length - highIntentPosts.length,
      latencyMs: Date.now() - startTime,
    });

    return {
      highIntentPosts,
      totalProcessed: posts.length,
    };
  },
});

// Step 3: Find matching events for each high-intent post
// REFACTORED: Event recommender now works independently - just pass the post text
// It extracts location, tags, time, budget, etc. on its own using modular tools
const findEventsStep = createStep({
  id: "find-events",
  description: "Searches Happenings database for relevant events",
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
    const logger = mastra?.getLogger();
    const startTime = Date.now();

    logger?.info("find-events-started", {
      totalHighIntentPosts: highIntentPosts.length,
    });

    for (const post of highIntentPosts) {
      const searchStart = Date.now();

      // REFACTORED: Pass just the post text - agent extracts everything it needs
      // Include parent context if available (for comment mentions)
      const query = post.parentContext
        ? `Parent post:\n${post.parentContext}\n\nUser comment:\n${post.text}\n\nFind the best matching events for this user.`
        : `User post:\n${post.text}\n\nFind the best matching events for this user.`;

      try {
        const result = await eventAgent.generate(query);
        const recommendations = result.text || "";
        const eventCount = (recommendations.match(/happenings\.dhruvgajwa\.com/g) || []).length;

        logger?.info("post-events-found", {
          postId: post.id,
          platform: post.platform,
          eventCount,
          hasRecommendations: recommendations.length > 0,
          latencyMs: Date.now() - searchStart,
        });

        postsWithEvents.push({
          ...post,
          recommendations,
        });
      } catch (err: any) {
        logger?.error("post-events-failed", {
          postId: post.id,
          platform: post.platform,
          error: err.message,
          latencyMs: Date.now() - searchStart,
        });
        console.error(`[findEventsStep] Error processing post ${post.id}:`, err);
        postsWithEvents.push({
          ...post,
          recommendations: "",
        });
      }
    }

    logger?.info("find-events-completed", {
      totalProcessed: highIntentPosts.length,
      totalMatched: postsWithEvents.filter(p => p.recommendations).length,
      latencyMs: Date.now() - startTime,
    });

    return {
      postsWithEvents,
      totalMatched: postsWithEvents.length,
    };
  },
});

// Step 4: Generate response drafts
// REFACTORED: Simplified prompt - response writer uses event recommendations as-is
// Event recommendations already include Happenings URLs with UTM tracking
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
    const logger = mastra?.getLogger();
    const startTime = Date.now();

    logger?.info("generate-response-started", {
      totalPostsWithEvents: postsWithEvents.length,
    });

    for (const post of postsWithEvents) {
      const generateStart = Date.now();

      // REFACTORED: Simplified prompt - no pre-extracted context
      // The event recommendations already contain all the relevant info
      const prompt = `
Original Post:
${post.text}

Event Recommendations (use these happeningsUrl links as href for event titles):
${post.recommendations ?? "No events found."}

Write a response following the tone and structure guidelines.
Use the happeningsUrl from each event as the href link for the event title.
      `.trim();

      try {
        const result = await responseAgent.generate(prompt);
        const draftResponse = result.text || "";
        const hasFooter = draftResponse.includes("🤖 *I'm Happenings Bot");

        logger?.info("response-draft-generated", {
          postId: post.id,
          platform: post.platform,
          responseLength: draftResponse.length,
          hasFooter,
          latencyMs: Date.now() - generateStart,
        });

        drafts.push({
          post,
          draftResponse,
        });
      } catch (err: any) {
        logger?.error("response-draft-failed", {
          postId: post.id,
          platform: post.platform,
          error: err.message,
          latencyMs: Date.now() - generateStart,
        });
        console.error(`[generateResponseStep] Error for post ${post.id}:`, err);
        drafts.push({ post, draftResponse: "" });
      }
    }

    logger?.info("generate-response-completed", {
      totalDrafts: drafts.length,
      successfulDrafts: drafts.filter(d => d.draftResponse).length,
      latencyMs: Date.now() - startTime,
    });

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
  description: "Mention-based pipeline for responding to u/Happenings_bot mentions with event recommendations",
  inputSchema: z.object({
    botUsername: z.string().default("Happenings_bot").describe("Reddit bot username to fetch mentions for"),
    maxMentions: z.number().default(25).describe("Maximum mentions to process per run"),
    freshnessHours: z.number().default(2).describe("Only process mentions newer than this"),
    markAsRead: z.boolean().default(false).describe("Mark processed mentions as read in Reddit inbox"),
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
  .then(fetchMentionsStep)
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
