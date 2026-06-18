# PropertyMatch Pro

Agent-controlled property matching workspace for turning buyer notes into structured criteria and scoring real listing exports.

## Harness

- Next.js App Router
- React + TypeScript
- Server routes for AI/tool calls
- No seeded listing data
- No artificial match scores

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Configure:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

The app intentionally blocks criteria extraction and listing scoring until those values are configured.

## Listing Import

Paste a real CSV export with headers such as:

```csv
address,price,city,url,description,image_urls
```

Use semicolons, pipes, or line breaks inside `image_urls` when a listing has multiple image URLs.

## Current Boundaries

- MLS integration is not assumed.
- Listing data comes from agent-provided exports/imports first.
- Photo analysis only runs when image URLs are included and the configured model supports vision.
- Email delivery is shown as disconnected until a real provider is selected.
