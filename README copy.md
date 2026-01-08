# Social Sniper AI Agent

An autonomous AI agent built with Mastra that acts as a 24/7 SDR for EventHive,
monitoring social channels for high-intent users and providing
hyper-personalized event recommendations.

## Features

- 🎯 **Intent Classification**: Detects "bored" or "planning" intent with <10%
  false positive rate
- 🔍 **Social Listening**: Monitors Reddit (r/bangalore, r/mumbai, etc.) and
  Twitter/X
- 🧠 **RAG-Powered Recommendations**: Semantic search across EventHive database
- 🛡️ **Safety Guardrails**: Content moderation and prompt injection detection
- 👤 **Human-in-the-Loop**: Approval system via Telegram/Slack before posting
- 🚀 **Rate Limiting**: Prevents spam and shadow-bans

## Quick Start

### 1. Installation

\`\`\`bash npm install \`\`\`

### 2. Configuration

Copy \`.env.example\` to \`.env\` and fill in your credentials:

\`\`\`bash cp .env.example .env \`\`\`

### 3. Development

\`\`\`bash npm run dev \`\`\`

Visit http://localhost:4111 to access Mastra Studio.

### 4. Build

\`\`\`bash npm run build \`\`\`

## Architecture

### Agents

1. **Intent Classifier** - Analyzes posts to detect planning intent
2. **Event Recommender** - Generates personalized event suggestions
3. **Response Writer** - Crafts human-like, context-aware responses

### Tools

1. **Reddit Monitor** - Fetches fresh posts from targeted subreddits
2. **Twitter Monitor** - Tracks geo-tagged tweets in target cities
3. **Event Search** - Performs semantic search on EventHive database
4. **Notification** - Sends drafts to Telegram/Slack for approval

### Workflows

1. **Social Sniper Pipeline** - Orchestrates the full ingestion → classification
   → retrieval → response → approval flow

## Safety & Compliance

- Sentiment filtering (blocks tragedy/rants)
- Prompt injection detection
- Rate limiting (max 2 posts/hour)
- Human approval required before posting
- Transparency ("I'm a solo dev, feedback welcome")

## Development Roadmap

- [x] Day 1: Ingestion + Intent Classification
- [x] Day 2: RAG + Response Generation
- [x] Day 3: Orchestration + Deployment

## License

MIT
