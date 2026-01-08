# Auto-Approve Feature - Quick Start Guide

## 🎯 What is Auto-Approve?

Auto-Approve mode allows the Social Sniper Agent to automatically post responses
to Reddit and Twitter **without human approval**. This is perfect for:

- **Testing** the complete end-to-end flow
- **High-confidence scenarios** where manual review isn't needed
- **Rapid deployment** when you trust the AI-generated responses

When `AUTO_APPROVE=false`, the workflow sends drafts to Telegram/Slack for human
review (requires additional setup).

---

## ✅ Current Implementation Status

**WORKING NOW:**

- ✅ Complete auto-approve flow (fetch → classify → generate → post)
- ✅ Posts to Reddit as comment replies
- ✅ Posts to Twitter as reply tweets
- ✅ Error handling and logging
- ✅ Conditional workflow branching

**COMING NEXT (Optional):**

- ⏳ Human approval via Telegram/Slack webhooks
- ⏳ Approval database for tracking
- ⏳ Edit and retry capabilities

---

## 🚀 Quick Start (Auto-Approve Mode)

### 1. Set Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Enable auto-approve mode
AUTO_APPROVE=true

# Reddit posting credentials (REQUIRED for auto-approve)
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret

# Twitter posting credentials (REQUIRED for auto-approve)
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret

# AI provider keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### 2. Run the Agent

```bash
npm run dev
```

### 3. Watch the Magic ✨

The agent will:

1. **Monitor** Reddit/Twitter for fresh posts in target cities
2. **Classify** posts as high or low intent
3. **Generate** personalized responses with event recommendations
4. **Post** approved responses automatically to Reddit/Twitter
5. **Display** posted URLs in the console

---

## 📋 Example Output

```
🎯 Starting Social Sniper Agent...

📡 Monitoring social channels...

🤖 AUTO-APPROVE MODE: Posting 2 responses...

  ✅ Posted to reddit: https://reddit.com/r/bangalore/comments/abc123/def456
  ✅ Posted to twitter: https://twitter.com/i/web/status/1234567890

📊 Auto-post results: 2 posted, 0 failed

✅ Workflow completed!
   Status: success

📊 Results:
   Mode: 🤖 AUTO-APPROVE
   High-intent posts detected: 2
   Responses posted: 2

🔗 Posted responses:
   1. https://reddit.com/r/bangalore/comments/abc123/def456
   2. https://twitter.com/i/web/status/1234567890
```

---

## 🔄 Switching to Manual Approval Mode

When you're ready to add human oversight:

```bash
# In .env
AUTO_APPROVE=false
```

With `AUTO_APPROVE=false`, the workflow will:

- Send drafts to Telegram/Slack for review
- Wait for `/approve`, `/reject`, or `/edit` commands
- Only post after human approval

**Note:** Manual approval mode requires additional setup (webhooks, database).
See `APPROVAL_FLOW_IMPLEMENTATION_PLAN.md` for details.

---

## 🛠️ How It Works

### Workflow Architecture

```
┌─────────────────────────────────────────────────────┐
│  1. Fetch Posts (Reddit/Twitter)                    │
│     ↓                                                │
│  2. Classify Intent (GPT-4o-mini)                   │
│     ↓                                                │
│  3. Find Events (RAG)                               │
│     ↓                                                │
│  4. Generate Response (Claude Sonnet 4)             │
│     ↓                                                │
│  5. Check AUTO_APPROVE environment variable         │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   AUTO=true            AUTO=false
        │                     │
        ▼                     ▼
   ┌─────────┐         ┌─────────────┐
   │ 6. Post │         │ 6. Send for │
   │ Auto    │         │ Approval    │
   └────┬────┘         └─────────────┘
        │
        ▼
    ✅ Done
```

### Key Files

- **`src/mastra/tools/post-to-platform.ts`** - Handles Reddit/Twitter posting
- **`src/mastra/workflows/social-sniper-pipeline.ts`** - Main workflow with
  branching logic
- **`src/index.ts`** - Entry point with result display

---

## ⚠️ Important Notes

### Reddit Posting Requirements

1. **Account credentials required**: You must provide `REDDIT_USERNAME` and
   `REDDIT_PASSWORD`
2. **Read-only mode won't work**: The default setup in `reddit-monitor.ts` has
   empty credentials (read-only). Update for posting.
3. **Rate limits**: Reddit has strict rate limits. Start slow (2-3 posts/hour).

### Twitter Posting Requirements

1. **Elevated access required**: Your Twitter app needs **write permissions**
   (not just read)
2. **Apply for elevated access** at https://developer.twitter.com if you only
   have Essential access
3. **Rate limits**: Twitter limits reply frequency. Monitor your usage.

### Safety Tips

- **Start with AUTO_APPROVE=false** to review drafts before going live
- **Test on low-traffic subreddits** first
- **Monitor for 24 hours** before scaling up
- **Set RATE_LIMIT_POSTS_PER_HOUR** conservatively (2-5 recommended)

---

## 🐛 Troubleshooting

### "Reddit posting requires REDDIT_USERNAME and REDDIT_PASSWORD"

**Solution**: Add these to your `.env` file:

```bash
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
```

### "Twitter API error: 403 Forbidden"

**Solution**: Your Twitter app doesn't have write permissions. Request elevated
access from Twitter Developer Portal.

### "No posts were made. Check logs for errors."

**Possible causes:**

1. No high-intent posts detected (adjust `INTENT_THRESHOLD`)
2. API credentials invalid
3. Rate limit reached
4. Network issues

Check the console logs for specific error messages.

---

## 📊 Monitoring & Metrics

The auto-approve flow logs:

- ✅ Successfully posted URLs
- ❌ Failed posts with error messages
- 📊 Success/failure counts
- 🔗 Direct links to posted comments/replies

All logs are visible in the console when running `npm run dev`.

---

## 🔜 Next Steps

1. **Test with AUTO_APPROVE=true** to verify end-to-end flow
2. **Monitor posted responses** on Reddit/Twitter
3. **Adjust INTENT_THRESHOLD** if getting too many/few posts
4. **Set up manual approval** for production use (optional)
5. **Add database tracking** for analytics (optional)

---

## 🆘 Getting Help

If you encounter issues:

1. **Check environment variables** are set correctly
2. **Verify Reddit/Twitter credentials** work (test with official clients)
3. **Review console logs** for specific error messages
4. **Test with a single city** first before scaling up

---

**Last Updated**: December 17, 2025 **Status**: ✅ Auto-approve mode fully
functional and ready to use!
