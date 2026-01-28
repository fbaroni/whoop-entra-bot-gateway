# Triathlon Assistant Bot

A personal training copilot that generates daily workout plans based on WHOOP fitness data. Integrates with Clawdbot for Telegram/WhatsApp messaging.

## Features

- 🏊 Personalized training recommendations based on recovery metrics
- ⌚ WHOOP integration (sleep, recovery, strain, HRV, heart rate)
- 🧾 Raw WHOOP payloads returned for debugging/analytics
- 💬 Chat interface via Clawdbot (Telegram/WhatsApp)
- 🔒 API key authentication

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌────────────┐
│  Telegram   │────▶│    Clawdbot     │────▶│  This API  │
│  WhatsApp   │     │  (skill-based)  │     │ :3000      │
└─────────────┘     └─────────────────┘     └─────┬──────┘
                                                  │
                                            ┌─────▼──────┐
                                            │  WHOOP API │
                                            └────────────┘
```

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your settings
```

Required variables:
- `API_KEY` - API authentication key (optional, disables auth if not set)
- `WHOOP_CLIENT_ID` - WHOOP Developer app client ID
- `WHOOP_CLIENT_SECRET` - WHOOP Developer app secret
- `WHOOP_REDIRECT_URI` - OAuth callback URL (e.g., `http://localhost:3000/api/whoop/callback`)

### 3. Run the API

```bash
# Development (with hot reload)
pnpm api:dev

# Production
pnpm build && node dist/api/index.js
```

### 4. Connect WHOOP

Visit `http://localhost:3000/api/whoop/connect` to authorize your WHOOP account.

### 5. Set up Clawdbot skill

The skill is located at: `~/clawd/skills/triathlon-coach/`

Add to `~/.clawdbot/clawdbot.json`:

```json
{
  "skills": {
    "entries": {
      "triathlon-coach": {
        "enabled": true,
        "env": {
          "TRIATHLON_API_URL": "http://localhost:3000",
          "TRIATHLON_API_KEY": "your-api-key"
        }
      }
    }
  }
}
```

Restart the gateway:

```bash
clawdbot gateway restart
```

## API Endpoints

### `GET /health`
Health check (no auth required).

### `GET /api/whoop/today`
Get current WHOOP metrics.

**Response:**
```json
{
  "sleepHours": 7.5,
  "sleepScore": 92.4,
  "recoveryScore": 68,
  "strain": 8.2,
  "avgHeartRate": 62,
  "maxHeartRate": 164,
  "kilojoule": 442,
  "hrv": 45,
  "restingHeartRate": 52,
  "raw": {
    "cycle": { "...": "full cycle payload" },
    "sleep": { "...": "full sleep payload" },
    "recovery": { "...": "full recovery payload" }
  }
}
```

### `POST /api/today-plan`
Generate a training plan.

**Request:**
```json
{
  "sleepHours": 7.5,
  "recoveryScore": 68,
  "muscleSoreness": 3,
  "activityType": "zwift"
}
```

**Response:**
```json
{
  "recommendation": "Moderate Zone 3 intervals",
  "intensity": "moderate",
  "duration": 60,
  "notes": "Focus on cadence work"
}
```

### WHOOP OAuth Flow

- `GET /api/whoop/connect` - Start OAuth flow
- `GET /api/whoop/callback` - OAuth callback
- `GET /api/whoop/status` - Check connection status
- `POST /api/whoop/disconnect` - Disconnect WHOOP

## Project Structure

```
src/
├── api/
│   ├── index.ts           # Express server
│   ├── auth/
│   │   └── apiKeyMiddleware.ts
│   ├── routes/
│   │   ├── todayPlan.ts   # Training plan logic
│   │   └── whoop.ts       # WHOOP endpoints
│   └── whoop/
│       ├── apiClient.ts   # WHOOP API client
│       ├── oauthClient.ts # OAuth flow
│       └── tokenStorage.ts
├── bot/
│   ├── index.ts           # CLI bot (dev mode)
│   ├── apiClient/         # API client for bot
│   └── commands/          # Command handlers
└── shared/
    ├── config.ts          # Configuration
    ├── logger.ts          # Logging
    └── types.ts           # TypeScript types
```

## Development

```bash
pnpm api:dev      # Run API with hot reload
pnpm bot:dev      # Run CLI bot (for testing)
pnpm typecheck    # Type check
pnpm lint         # Lint
pnpm build        # Build for production
```

## WHOOP API Notes

Currently available data (depends on app permissions):
- ✅ Cycles (strain, avg/max heart rate, kilojoules)
- ✅ Profile (user info)
- ⚠️ Recovery (requires WHOOP app approval)
- ⚠️ Sleep (requires WHOOP app approval)

If recovery/sleep return 404, your WHOOP Developer app may need additional permissions. Contact WHOOP support or check your app settings at [developer.whoop.com](https://developer.whoop.com).

Raw WHOOP payloads are included under `raw` when available to help debug missing fields.

## Usage via Telegram

Once connected to Clawdbot, send messages like:

- "give me my training plan"
- "how should I train today?"
- "check my WHOOP data"

The bot will:
1. Fetch your WHOOP metrics automatically
2. Ask for missing info (muscle soreness, activity type)
3. Generate a personalized training plan

## License

Private project.
