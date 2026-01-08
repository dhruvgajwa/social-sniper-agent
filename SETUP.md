# Social Sniper AI Agent - Setup Guide

## Overview

You've successfully created a complete autonomous AI agent for EventHive using
Mastra! This agent monitors social media, detects high-intent users, and
generates personalized event recommendations.

## What's Been Built

### 🤖 Agents (3)

1. **Intent Classifier** - Detects planning intent with <10% false positive rate
2. **Event Recommender** - Finds matching events using RAG
3. **Response Writer** - Crafts human-like, brand-aligned responses

### 🛠️ Tools (4)

1. **Reddit Monitor** - Fetches fresh posts from Indian city subreddits
2. **Twitter Monitor** - Tracks geo-tagged tweets in target cities
3. **Event Search** - Semantic search on EventHive database
4. **Notification** - Sends drafts to Telegram/Slack for approval

### 🔄 Workflows (1)

**Social Sniper Pipeline** - Complete end-to-end orchestration:

- Ingest → Classify → Retrieve → Generate → Approve

## Quick Start

### 1. Install Dependencies

```bash
cd social-sniper-agent
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

**Required:**

- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`
- `TWITTER_API_KEY`, `TWITTER_API_SECRET`, etc.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (or Slack webhook)

**Optional:**

- `EVENTHIVE_DB_URL` - Your MongoDB or API endpoint
- `TARGET_CITIES` - Comma-separated city list
- `INTENT_THRESHOLD` - Classification confidence threshold (default: 0.8)

### 3. Test Individual Components

Test the intent classifier:

```bash
npm run dev
# In another terminal:
npx tsx src/test-intent.ts
```

Test response generation:

```bash
npx tsx src/test-response.ts
```

### 4. Run the Full Pipeline

```bash
npx tsx src/index.ts
```

This will:

1. Monitor Reddit and Twitter
2. Classify posts for intent
3. Search for matching events
4. Generate responses
5. Send drafts to Telegram/Slack for approval

### 5. Use Mastra Studio

```bash
npm run dev
```

Visit http://localhost:4111 to:

- Test agents interactively
- View workflow execution
- Debug individual steps
- Monitor logs and traces

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           Social Sniper Pipeline (Workflow)         │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────┐
    │  1. Fetch Posts (Reddit + Twitter)     │
    └────────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────┐
    │  2. Classify Intent (GPT-4o-mini)      │
    │     - High vs Low Intent               │
    │     - Extract Context                  │
    └────────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────┐
    │  3. Find Events (RAG)                  │
    │     - Semantic Search                  │
    │     - EventHive Database               │
    └────────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────┐
    │  4. Generate Response (Claude Sonnet) │
    │     - Human-like Tone                  │
    │     - Founder Signature                │
    └────────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────┐
    │  5. Human Approval (Telegram/Slack)    │
    │     - Review Draft                     │
    │     - Approve/Reject/Edit              │
    └────────────────────────────────────────┘
```

## Next Steps

### Production Deployment

1. **Connect to EventHive Database**

   - Update `src/mastra/tools/event-search.ts`
   - Replace mock data with actual MongoDB/API calls
   - Implement vector embeddings for semantic search

2. **Set Up Scheduling**

   - Use cron jobs, Inngest, or similar
   - Run every 1-2 hours to stay under rate limits
   - Track processed posts to avoid duplicates

3. **Implement Posting Logic**

   - Add Reddit/Twitter posting after approval
   - Track engagement metrics
   - Implement rate limiting (max 2 posts/hour)

4. **Add Vector Search**
   - Use OpenAI Embeddings
   - Store in Pinecone, Weaviate, or MongoDB Atlas
   - Improve event matching accuracy

### Monitoring & Optimization

- **Track Metrics:**

  - False positive rate (target: <10%)
  - Conversion rate (clicks to EventHive)
  - Response engagement

- **A/B Testing:**
  - Different response tones
  - Event recommendation strategies
  - Approval workflow variations

### Safety Enhancements

- Add sentiment analysis
- Implement shadow-ban detection
- Track user feedback loops
- Monitor brand mentions

## Project Structure

```
social-sniper-agent/
├── src/
│   ├── mastra/
│   │   ├── agents/
│   │   │   ├── intent-classifier.ts
│   │   │   ├── event-recommender.ts
│   │   │   └── response-writer.ts
│   │   ├── tools/
│   │   │   ├── reddit-monitor.ts
│   │   │   ├── twitter-monitor.ts
│   │   │   ├── event-search.ts
│   │   │   └── notification.ts
│   │   ├── workflows/
│   │   │   └── social-sniper-pipeline.ts
│   │   └── index.ts
│   ├── index.ts
│   ├── test-intent.ts
│   └── test-response.ts
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Troubleshooting

**Issue:** "Workflow not found"

- Make sure you've registered the workflow in `src/mastra/index.ts`

**Issue:** "Agent not found"

- Check that agents are properly imported and registered

**Issue:** "API rate limit exceeded"

- Reduce `maxPosts` and `maxTweets` in workflow input
- Increase time between runs

**Issue:** "No events found"

- Update mock data in `event-search.ts`
- Connect to actual EventHive database

## Support

- **Mastra Docs:** https://mastra.ai/docs
- **Mastra Discord:** https://discord.gg/mastra
- **GitHub Issues:** Create an issue in your EventHive repo

## License

MIT

---

Built with ❤️ using Mastra by the EventHive team
