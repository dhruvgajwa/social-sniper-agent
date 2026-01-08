# Copilot Instructions for social-sniper-agent

## Project Overview

This is a Mastra-based AI agent for social media automation/monitoring ("social sniper"). The project uses the Mastra framework for building AI agents with tools and workflows.

## Tech Stack

- **Framework**: [Mastra](https://mastra.ai/) - AI agent framework
- **Language**: TypeScript
- **Runtime**: Node.js
- **Build artifacts**: `.mastra/output/` (auto-generated, do not edit)

## Project Structure (Expected)

```
src/
├── agents/       # Agent definitions and configurations
├── tools/        # Custom tools for agent actions
├── workflows/    # Multi-step agent workflows
└── index.ts      # Main entry point
.mastra/          # Mastra build output (gitignored internals)
```

## Development Workflow

```bash
# Install dependencies
npm install

# Run the Mastra development server
npx mastra dev

# Build for production
npx mastra build
```

## Key Conventions

- Define agents in `src/agents/` using Mastra's `Agent` class
- Create reusable tools in `src/tools/` - each tool should be single-purpose
- Store API keys and secrets in `.env` (never commit)
- Use Mastra's built-in integrations when available before building custom tools

## Environment Variables

Required in `.env`:

- Social media API credentials (platform-specific)
- `OPENAI_API_KEY` or other LLM provider keys as needed

---

_This file will be updated as the project develops. Add project-specific patterns here as they emerge._
