# Copilot Instructions for social-sniper-agent

## Project Overview

Autonomous AI agent for EventHive that monitors Reddit/Twitter for event-planning intent, recommends matching events using RAG, and generates personalized responses. Features human-in-the-loop approval workflow with Telegram/Slack integration.

## Tech Stack

- **Framework**: Mastra (v0.14+) - AI agent orchestration
- **LLMs**: OpenAI GPT-4o-mini (intent/events), Anthropic Claude Sonnet (responses)
- **Storage**: LibSQL for workflow state and approval tracking
- **APIs**: Reddit (snoowrap), Twitter v2, Telegram Bot API, Slack webhooks
- **Runtime**: TypeScript on Node.js

## Architecture

### Core Components

1. **3 AI Agents** (`src/mastra/agents/`):
   - `intent-classifier.ts` - Detects planning intent with <10% false positive target
   - `event-recommender.ts` - RAG-based event matching with semantic search
   - `response-writer.ts` - Generates brand-aligned, conversational responses

2. **5 Tools** (`src/mastra/tools/`):
   - `reddit-monitor.ts` / `twitter-monitor.ts` - Fetch posts from Indian city subreddits/geo-tagged tweets
   - `event-search.ts` - Mock EventHive database search (replace with real MongoDB/vector DB)
   - `notification.ts` - Send drafts to Telegram/Slack for approval
   - `post-to-platform.ts` - Publish approved responses to Reddit/Twitter

3. **Workflow** (`src/mastra/workflows/social-sniper-pipeline.ts`):
   - **5-step pipeline**: Fetch → Classify → Find Events → Generate Response → Approve/Post
   - **Branching logic**: AUTO_APPROVE env var routes to either auto-posting or human approval

4. **Approval System** (`src/approvals/`):
   - `store.ts` - LibSQL-backed approval tracking with draft lifecycle
   - `webhooks.ts` - Express handlers for Telegram/Slack approval callbacks
   - `server.ts` - Webhook server (auto-disabled when AUTO_APPROVE=true)

### Data Flow

```
Social Posts → Intent Classification → Event Matching → Response Generation
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
    context: { subreddits: [...] },
    runtimeContext  // REQUIRED - don't omit!
  });
}
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
npx tsx src/index.ts   # Run full pipeline manually

# Testing
npx tsx src/test-intent.ts     # Test intent classifier
npx tsx src/test-response.ts   # Test response writer

# Evaluation (Mastra Evals Framework)
npm run eval:intent            # Run intent classification scorers
npm run eval:response          # Run response quality scorers
npm run eval:view              # View evaluation results
```

## Environment Variables (Critical)

**LLMs**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`  
**Social APIs**: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `TWITTER_BEARER_TOKEN`  
**Notifications**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` or `SLACK_WEBHOOK_URL`  
**Behavior**:

- `AUTO_APPROVE=false` (default) → Human approval required via Telegram/Slack
- `AUTO_APPROVE=true` → Skip approval, auto-post responses
- `APPROVAL_NOTIFICATION_CHANNEL=telegram|slack` → Choose notification platform

## Project-Specific Conventions

1. **Approval IDs**: Use crypto.randomBytes(8).toString('hex') for tracking drafts across webhooks
2. **Post Freshness**: Default 2-hour window (`POST_FRESHNESS_HOURS=2`) to avoid stale posts
3. **Rate Limiting**: Max 2 posts/hour (`RATE_LIMIT_POSTS_PER_HOUR=2`) to prevent spam
4. **Intent Threshold**: 0.8 confidence (`INTENT_THRESHOLD=0.8`) for high-intent classification
5. **Webhook Server**: Auto-disables when `AUTO_APPROVE=true` or `WEBHOOK_ENABLED=false`

## Common Pitfalls

- **RuntimeContext missing**: Workflow steps crash without `runtimeContext` passed to tools
- **Wrong agent response access**: No `.output` property exists - use `.text` or `.object`
- **Tools in Mastra config**: Don't register tools manually - they auto-register
- **Approval store not initialized**: Call `approvalStore.init()` before first use
- **Webhook server conflicts**: Check `WEBHOOK_PORT` (default 3000) isn't already in use

## Key Files for Context

- **`TYPESCRIPT_FIXES.md`** - Common Mastra API mistakes and fixes
- **`SETUP.md`** - Production deployment checklist (vector search, scheduling, real database)
- **`AUTO_APPROVE_GUIDE.md`** / **`HUMAN_APPROVAL_GUIDE.md`** - Approval workflow details
- **`EVALUATION_GUIDE.md`** - Mastra Evals integration for quality scoring

## Next Production Steps

1. Replace mock data in `event-search.ts` with real EventHive MongoDB/API
2. Implement vector embeddings (OpenAI) + vector DB (Pinecone/Weaviate) for semantic event search
3. Set up cron/Inngest scheduling (every 1-2 hours to respect rate limits)
4. Add duplicate post tracking to avoid re-processing
5. Configure Mastra Evals sampling rates (currently 20%) for production monitoring
