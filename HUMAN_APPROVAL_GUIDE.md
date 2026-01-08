# Human Approval Flow - Complete Guide

## 🎯 Overview

The Social Sniper Agent now supports **two approval modes**:

1. **Auto-Approve** (Set `AUTO_APPROVE=true`) - Posts responses automatically
   without human review
2. **Manual Approval** (Set `AUTO_APPROVE=false`) - Sends drafts to
   Telegram/Slack for human review before posting

This guide covers the **Manual Approval Flow** using environment variables for
all decisional tasks.

---

## 🏗️ Architecture

### Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│  1. Monitor Reddit/Twitter                          │
│     ↓                                                │
│  2. Classify Intent                                 │
│     ↓                                                │
│  3. Find Events                                     │
│     ↓                                                │
│  4. Generate Response Draft                         │
│     ↓                                                │
│  5. Check AUTO_APPROVE env var                      │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   AUTO=true            AUTO=false
        │                     │
        ▼                     ▼
   ┌─────────┐      ┌──────────────────┐
   │ 6. Post │      │ 6. Save to DB    │
   │ Auto    │      │ 7. Send Telegram │
   └─────────┘      │    or Slack      │
                    └────────┬─────────┘
                             │
                    ┌────────┴────────┐
                    │ Human Reviews   │
                    │ via Webhook     │
                    └────────┬────────┘
                             │
                 ┌───────────┼──────────┐
                 │           │          │
            /approve     /reject    /edit
                 │           │          │
                 ▼           ▼          ▼
           ┌─────────┐  ┌────────┐  ┌──────────┐
           │ Post to │  │ Discard│  │ Edit &   │
           │ Platform│  │        │  │ Re-submit│
           └─────────┘  └────────┘  └──────────┘
```

### Components

1. **Approval Store** (`src/approvals/store.ts`)
   - LibSQL database for tracking drafts
   - Stores: draft content, post metadata, status
     (pending/approved/rejected/edited)
   - Methods: saveDraft, getDraftByNotificationId, approveDraft, rejectDraft,
     editDraft

2. **Webhook Handlers** (`src/approvals/webhooks.ts`)
   - Telegram: `/approve`, `/reject`, `/edit` commands
   - Slack: Interactive button clicks
   - Posts approved responses automatically

3. **Webhook Server** (`src/server.ts`)
   - Express server on configurable port (default: 3000)
   - Endpoints: `/webhooks/telegram`, `/webhooks/slack`, `/health`
   - Auto-disabled when `AUTO_APPROVE=true`

4. **Notification Tool** (`src/mastra/tools/notification.ts`)
   - Sends formatted notifications to Telegram/Slack
   - Saves drafts to database with unique notification IDs
   - Includes notification ID in messages for webhook tracking

---

## ⚙️ Environment Variables (All Decisional Tasks)

### Core Approval Configuration

```bash
# PRIMARY DECISION: Auto-approve or manual approval
AUTO_APPROVE=false                              # "true" = auto-post, "false" = manual approval

# NOTIFICATION CHANNEL DECISION: Which platform to use
APPROVAL_NOTIFICATION_CHANNEL=telegram          # "telegram" or "slack"

# DATABASE DECISION: Where to store pending approvals
APPROVAL_DB_URL=file:./approvals.db            # Use "file:./approvals.db" for persistence

# EDIT BEHAVIOR DECISION: Auto-post edited drafts or require re-approval
APPROVE_EDITED_IMMEDIATELY=false                # "true" = auto-post edits, "false" = require /approve

# WEBHOOK SERVER DECISION: Enable webhook listener
WEBHOOK_ENABLED=true                            # "true" = start server, "false" = disable (auto-disabled if AUTO_APPROVE=true)

# WEBHOOK PORT DECISION: Which port to listen on
WEBHOOK_PORT=3000                               # Port for webhook server
```

### Telegram Configuration

```bash
# Required for Telegram notifications
TELEGRAM_BOT_TOKEN=your_bot_token_here          # Get from @BotFather
TELEGRAM_CHAT_ID=your_chat_id_here              # Your Telegram user/group ID
```

### Slack Configuration

```bash
# Required for Slack notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...   # Incoming webhook URL
SLACK_SIGNING_SECRET=your_signing_secret        # For request verification
```

### Other Configuration

```bash
# Intent threshold for filtering posts
INTENT_THRESHOLD=0.8                            # 0-1 confidence score

# Rate limiting
RATE_LIMIT_POSTS_PER_HOUR=2                     # Max posts per hour

# Target cities
TARGET_CITIES=Bangalore,Mumbai,Delhi,Pune,Hyderabad
```

---

## 🚀 Setup Guide

### 1. Install Dependencies

```bash
cd social-sniper-agent
npm install
```

This will install:

- `express` - Webhook server
- `@types/express` - TypeScript types
- All existing dependencies

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and set your values:

```bash
# Enable manual approval mode
AUTO_APPROVE=false

# Choose notification channel
APPROVAL_NOTIFICATION_CHANNEL=telegram   # or "slack"

# Set database location (use file for persistence)
APPROVAL_DB_URL=file:./approvals.db

# Configure your notification platform
TELEGRAM_BOT_TOKEN=your_actual_token
TELEGRAM_CHAT_ID=your_actual_chat_id

# Enable webhook server
WEBHOOK_ENABLED=true
WEBHOOK_PORT=3000
```

### 3. Set Up Telegram Bot (Recommended)

#### Step 3.1: Create Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow prompts to name your bot
4. Copy the **bot token** to `TELEGRAM_BOT_TOKEN`

#### Step 3.2: Get Chat ID

1. Message your bot with `/start`
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Find your `chat.id` in the JSON response
4. Copy to `TELEGRAM_CHAT_ID`

#### Step 3.3: Set Up Webhook (for local development)

**Option A: Using ngrok (Recommended)**

```bash
# Install ngrok (if not installed)
brew install ngrok   # macOS
# or download from https://ngrok.com/

# Start webhook server first
npm run dev

# In another terminal, expose webhook server
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Set webhook:
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://abc123.ngrok.io/webhooks/telegram"}'
```

**Option B: Using Cloudflare Tunnel**

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:3000

# Use the provided URL to set webhook
```

### 4. Set Up Slack (Alternative)

#### Step 4.1: Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name it "Social Sniper" and select workspace

#### Step 4.2: Enable Incoming Webhooks

1. Go to "Incoming Webhooks" in sidebar
2. Toggle "Activate Incoming Webhooks" to On
3. Click "Add New Webhook to Workspace"
4. Select channel and authorize
5. Copy webhook URL to `SLACK_WEBHOOK_URL`

#### Step 4.3: Enable Interactive Components

1. Go to "Interactivity & Shortcuts"
2. Toggle "Interactivity" to On
3. Set Request URL to `https://your-ngrok-url.ngrok.io/webhooks/slack`
4. Copy Signing Secret to `SLACK_SIGNING_SECRET`

### 5. Run the Agent

```bash
npm run dev
```

Expected output:

```
🎯 Starting Social Sniper Agent...

🌐 Webhook server started on port 3000
   Telegram: POST http://localhost:3000/webhooks/telegram
   Slack:    POST http://localhost:3000/webhooks/slack
   Health:   GET  http://localhost:3000/health

📡 Monitoring social channels...

👤 MANUAL APPROVAL MODE: Sending 3 drafts to telegram...

  ✅ Sent notification for reddit post: abc123
  ✅ Sent notification for twitter post: 1234567890
  ✅ Sent notification for reddit post: def456

✅ Workflow completed!
   Status: success

📊 Results:
   Mode: 👤 MANUAL APPROVAL
   High-intent posts detected: 3
   Draft responses sent for approval: 3

⏳ Pending approval: 3 posts
   Check your Telegram/Slack for approval requests!
   Webhook server is running to receive approvals.
```

---

## 📱 Using the Approval Flow

### Telegram Commands

When you receive a notification in Telegram, it will look like:

```
🎯 New High-Intent Post Detected

📱 Platform: reddit
👤 Author: user123
🔗 Post URL: https://reddit.com/r/bangalore/comments/abc123

📝 Original Post:
Looking for live music events this weekend in Bangalore. Any suggestions?

---

✍️ Proposed Response:
Hey! Check out the Jazz Night at Blue Frog this Saturday...

---

🎉 Recommended Events:
• Jazz Night at Blue Frog - Dec 21, 2025
• Indie Music Fest - Dec 22, 2025

---

Notification ID: `a1b2c3d4e5f6g7h8i9j0`

Reply with:
✅ /approve a1b2c3d4e5f6g7h8i9j0
❌ /reject a1b2c3d4e5f6g7h8i9j0
✏️ /edit a1b2c3d4e5f6g7h8i9j0 [your message]
```

#### Approve a Draft

```
/approve a1b2c3d4e5f6g7h8i9j0
```

Response:

```
✅ Posted successfully!

🔗 https://reddit.com/r/bangalore/comments/abc123/def456
```

#### Reject a Draft

```
/reject a1b2c3d4e5f6g7h8i9j0
```

Response:

```
❌ Draft rejected and discarded.
```

#### Edit a Draft

```
/edit a1b2c3d4e5f6g7h8i9j0 Hey! I'd recommend checking out the Jazz Night at Blue Frog this Saturday. Great vibes and live music! 🎵
```

Response (if `APPROVE_EDITED_IMMEDIATELY=true`):

```
✅ Edited and posted successfully!

🔗 https://reddit.com/r/bangalore/comments/abc123/def456
```

Response (if `APPROVE_EDITED_IMMEDIATELY=false`):

```
✏️ Draft edited. Use /approve a1b2c3d4e5f6g7h8i9j0 to post.
```

### Slack Buttons

In Slack, you'll see:

```
🎯 New High-Intent Post Detected

Platform: reddit
Author: user123

Original Post:
Looking for live music events this weekend in Bangalore...

---

Proposed Response:
Hey! Check out the Jazz Night at Blue Frog...

---

Recommended Events:
• Jazz Night at Blue Frog
• Indie Music Fest

Notification ID: `a1b2c3d4e5f6g7h8i9j0`

[✅ Approve]  [❌ Reject]
```

Click **✅ Approve** to post immediately.

---

## 🔧 Environment Variable Decision Matrix

| Variable                        | Default               | Options                      | Purpose                                                   |
| ------------------------------- | --------------------- | ---------------------------- | --------------------------------------------------------- |
| `AUTO_APPROVE`                  | `false`               | `true`, `false`              | **Main switch**: Auto-post or require approval            |
| `APPROVAL_NOTIFICATION_CHANNEL` | `telegram`            | `telegram`, `slack`          | **Platform choice**: Where to send notifications          |
| `APPROVAL_DB_URL`               | `file:./approvals.db` | `:memory:`, `file:./path.db` | **Storage decision**: In-memory or persistent             |
| `APPROVE_EDITED_IMMEDIATELY`    | `false`               | `true`, `false`              | **Edit behavior**: Auto-post edits or require re-approval |
| `WEBHOOK_ENABLED`               | `true`                | `true`, `false`              | **Server control**: Enable/disable webhook listener       |
| `WEBHOOK_PORT`                  | `3000`                | Any port number              | **Port selection**: Which port to listen on               |

---

## 🐛 Troubleshooting

### "Webhook server disabled"

**Cause**: `AUTO_APPROVE=true` or `WEBHOOK_ENABLED=false`

**Solution**: Set `AUTO_APPROVE=false` and `WEBHOOK_ENABLED=true` in `.env`

### "Draft not found for notification ID"

**Cause**: Database was reset or notification ID is incorrect

**Solution**:

1. Check if database file exists: `ls approvals.db`
2. Verify notification ID matches exactly (copy-paste recommended)
3. Check database wasn't cleared between workflow run and approval

### "Telegram API error: Unauthorized"

**Cause**: Invalid `TELEGRAM_BOT_TOKEN`

**Solution**: Get fresh token from @BotFather and update `.env`

### "Telegram API error: Bad Request: chat not found"

**Cause**: Invalid `TELEGRAM_CHAT_ID`

**Solution**:

1. Message your bot with `/start`
2. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Copy correct chat ID from response

### "Invalid Slack signature"

**Cause**: `SLACK_SIGNING_SECRET` is wrong or missing

**Solution**: Copy signing secret from Slack app settings → Basic Information

### Webhook not receiving requests

**Cause**: Ngrok/tunnel not set up or webhook URL not configured

**Solution**:

1. Verify ngrok is running: `ngrok http 3000`
2. Check Telegram webhook:
   `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
3. Reset webhook with correct URL

---

## 📊 Database Schema

The approval store uses this schema:

```sql
CREATE TABLE draft_approvals (
  id TEXT PRIMARY KEY,                    -- UUID
  notification_id TEXT UNIQUE NOT NULL,   -- 32-char hex (sent in notifications)
  platform TEXT NOT NULL,                 -- "reddit" or "twitter"
  post_id TEXT NOT NULL,                  -- Original post ID
  post_url TEXT NOT NULL,                 -- Link to original post
  post_author TEXT NOT NULL,              -- Post author username
  post_content TEXT NOT NULL,             -- Original post text
  draft_response TEXT NOT NULL,           -- AI-generated response
  recommended_events TEXT NOT NULL,       -- JSON array of event names
  status TEXT NOT NULL,                   -- "pending", "approved", "rejected", "edited"
  created_at INTEGER NOT NULL,            -- Unix timestamp
  updated_at INTEGER NOT NULL,            -- Unix timestamp
  approved_by TEXT,                       -- Username who approved/rejected
  edited_response TEXT                    -- Modified response (if edited)
);
```

View drafts manually:

```bash
sqlite3 approvals.db "SELECT notification_id, status, platform, created_at FROM draft_approvals;"
```

---

## 🔜 Next Steps

1. **Test Manual Approval**: Set `AUTO_APPROVE=false` and send test
   notifications
2. **Set Up Production Webhooks**: Use permanent URLs (not ngrok) for production
3. **Monitor Database**: Check `approvals.db` regularly and clean old drafts
4. **Add Analytics**: Track approval rates, edit frequency, rejection reasons
5. **Scale Webhooks**: Deploy webhook server separately from agent for
   reliability

---

**Last Updated**: December 17, 2025 **Status**: ✅ Human approval flow fully
implemented with environment variable control!
