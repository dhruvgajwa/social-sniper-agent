# Copilot Instructions for social-sniper-agent

## Project Overview

Reddit bot (`u/Happenings_bot`) that responds to user mentions with personalized event recommendations from the Happenings platform. The bot reacts only to explicit mentions - it does NOT crawl or scrape subreddits. Features human-in-the-loop approval workflow with Telegram/Slack integration.

### Directive

The Happenings bot operates as an autonomous AI agent built with Mastra framework. It is alert for Reddit mentions in posts/comments indicating event-planning intent. The workflow consists of 5 main steps:

1. **MONITOR**: Fetch mentions from Reddit inbox
2. **CLASSIFY**: Intent classifier agent uses GPT-4o-mini to detect planning intent with 80% confidence threshold, filtering for genuine event searches (~10% false positive target)
3. **RECOMMEND**: Event recommender agent performs semantic search on Happenings database using RAG with vector embeddings to find matching events
4. **GENERATE**: Response writer agent (Claude Sonnet) crafts personalized, brand-aligned responses recommending relevant events
5. **APPROVE**: Human-in-loop approval via Telegram/Slack webhooks before posting

The bot respects rate limits (max 2 posts/hour) and post freshness windows (2-hour default). All workflow state and approvals are tracked in LibSQL database.

**Product Reference**: https://happenings.dhruvgajwa.com/city/bangalore

## Tech Stack

- **Framework**: Mastra (v0.14+) - AI agent orchestration
- **LLMs**: OpenAI GPT-4o-mini (intent/events), Anthropic Claude Sonnet (responses)
- **Storage**: LibSQL for workflow state and approval tracking
- **APIs**: Reddit (snoowrap) for mentions, Telegram Bot API / Slack webhooks for approvals
- **Runtime**: TypeScript on Node.js

## Architecture

### Core Components

1. **3 AI Agents** (`src/mastra/agents/`):
   - `intent-classifier.ts` - Detects planning intent with <10% false positive target
   - `event-recommender.ts` - RAG-based event matching with semantic search
   - `response-writer.ts` - Generates brand-aligned, conversational responses

2. **5 Tools** (`src/mastra/tools/`):
   - `reddit-monitor.ts` - Fetches mentions of u/Happenings_bot from Reddit inbox (NOT subreddit scraping)
   - `twitter-monitor.ts` - Twitter monitoring (optional, not in main flow)
   - `event-search.ts` - Mock Happenings database search (replace with real MongoDB/vector DB)
   - `notification.ts` - Send drafts to Telegram/Slack for approval
   - `post-to-platform.ts` - Publish approved responses as Reddit replies

3. **Workflow** (`src/mastra/workflows/social-sniper-pipeline.ts`):
   - **5-step pipeline**: Fetch Mentions → Classify Intent → Find Events → Generate Response → Approve/Post
   - **Branching logic**: AUTO_APPROVE env var routes to either auto-posting or human approval

4. **Approval System** (`src/approvals/`):
   - `store.ts` - LibSQL-backed approval tracking with draft lifecycle
   - `webhooks.ts` - Express handlers for Telegram/Slack approval callbacks
   - `server.ts` - Webhook server (auto-disabled when AUTO_APPROVE=true)

### Data Flow

```
User mentions u/Happenings_bot → Fetch from inbox → Intent Classification
                                                           ↓
                            Event Matching (RAG) → Response Generation
                                                           ↓
                        AUTO_APPROVE=false ←→ Human Approval (Telegram/Slack)
                        AUTO_APPROVE=true  ←→ Direct Posting
```

## Critical Mastra Patterns

### 1. Tool Execution in Workflows

**Always pass `runtimeContext`** from step params to `tool.execute()`:

```typescript
execute: async ({ inputData, mastra, runtimeContext }) => {
  await redditMonitorTool.execute({
    context: { botUsername: "Happenings_bot", maxMentions: 25 },
    runtimeContext, // REQUIRED - don't omit!
  });
};
```

### 2. Agent Response Access

Use `result.text` for text generation, `result.object` for structured output:

```typescript
const result = await intentAgent.generate(query);
const classification = result.text; // NOT .output or .object.text
```

### 3. Mastra Registration

Only register agents/workflows in `src/mastra/index.ts` - **tools auto-register**:

```typescript
export const mastra = new Mastra({
  agents: { intentClassifierAgent, ... },
  workflows: { socialSniperWorkflow },
  storage: new LibSQLStore({ url: ":memory:" }),
  // NO tools: {...} property!
});
```

### 4. Workflow Branching

Use `.branch()` for conditional logic based on env vars or runtime state:

```typescript
.branch([
  [async () => process.env.AUTO_APPROVE === "true", autoPostStep],
  [async () => process.env.AUTO_APPROVE !== "true", sendForApprovalStep],
])
```

## Development Workflow

```bash
# Setup
cp .env.example .env   # Configure API keys (see required vars below)
npm install

# Development
npx mastra dev         # Mastra Studio on http://localhost:4111
npx tsx src/index.ts   # Run bot manually (check for mentions)

# Testing with mock data
USE_TEST_DATA_REDDIT=true npx tsx src/index.ts

# Testing individual components
npx tsx src/test-intent.ts     # Test intent classifier
npx tsx src/test-response.ts   # Test response writer

# Evaluation (Mastra Evals Framework)
npm run eval:intent            # Run intent classification scorers
npm run eval:response          # Run response quality scorers
npm run eval:view              # View evaluation results
```

## Environment Variables (Critical)

**LLMs**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`  
**Reddit API**: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`  
**Bot Config**: `REDDIT_BOT_USERNAME=Happenings_bot`, `MAX_MENTIONS_PER_RUN=25`  
**Notifications**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` or `SLACK_WEBHOOK_URL`  
**Behavior**:

- `AUTO_APPROVE=false` (default) → Human approval required via Telegram/Slack
- `AUTO_APPROVE=true` → Skip approval, auto-post responses
- `APPROVAL_NOTIFICATION_CHANNEL=telegram|slack` → Choose notification platform
- `MARK_MENTIONS_AS_READ=true` → Mark processed mentions as read in Reddit inbox

## Project-Specific Conventions

1. **Mention-Based**: Bot reacts to `u/Happenings_bot` mentions only - NO subreddit scraping
2. **Approval IDs**: Use crypto.randomBytes(8).toString('hex') for tracking drafts across webhooks
3. **Post Freshness**: Default 2-hour window (`POST_FRESHNESS_HOURS=2`) to avoid stale mentions
4. **Rate Limiting**: Max 2 posts/hour (`RATE_LIMIT_POSTS_PER_HOUR=2`) to prevent spam
5. **Intent Threshold**: 0.8 confidence (`INTENT_THRESHOLD=0.8`) for high-intent classification
6. **Webhook Server**: Auto-disables when `AUTO_APPROVE=true` or `WEBHOOK_ENABLED=false`

## Common Pitfalls

- **RuntimeContext missing**: Workflow steps crash without `runtimeContext` passed to tools
- **Wrong agent response access**: No `.output` property exists - use `.text` or `.object`
- **Tools in Mastra config**: Don't register tools manually - they auto-register
- **Approval store not initialized**: Call `approvalStore.init()` before first use
- **Webhook server conflicts**: Check `WEBHOOK_PORT` (default 3000) isn't already in use
- **Missing Reddit credentials**: Bot needs `REDDIT_USERNAME` and `REDDIT_PASSWORD` to read inbox

## Key Files for Context

- **`docs/ADMIN_SETUP_GUIDE.md`** - Complete admin setup and usage documentation
- **`TYPESCRIPT_FIXES.md`** - Common Mastra API mistakes and fixes
- **`SETUP.md`** - Production deployment checklist (vector search, scheduling, real database)
- **`AUTO_APPROVE_GUIDE.md`** / **`HUMAN_APPROVAL_GUIDE.md`** - Approval workflow details
- **`EVALUATION_GUIDE.md`** - Mastra Evals integration for quality scoring

## Next Production Steps

1. Replace mock data in `event-search.ts` with real Happenings MongoDB/API
2. Implement vector embeddings (OpenAI) + vector DB (Pinecone/Weaviate) for semantic event search
3. Set up cron/Inngest scheduling (every 5-15 minutes to check for mentions)
4. Add duplicate mention tracking to avoid re-processing
5. Configure Mastra Evals sampling rates (currently 20%) for production monitoring
