# WithOne AI Integration Strategy

## Overview

WithOne AI (withone.ai) is a massive API aggregation and agent-tooling platform. After reviewing their offering, they present an incredibly compelling alternative (or addition) to Composio and Zernio for BusinessKit.

## Why WithOne AI?

1. **Insane Free Tier**: While Composio gives 20,000 tool calls per month, WithOne's free tier provides an allocation of **1,000,000 API calls**! That is 50x larger, making it essentially unlimited for an individual self-hosting BusinessKit.
2. **Connector Volume**: They boast over 75,000 integrations. If you ever want to expand BusinessKit beyond standard social media (e.g., into CRM, eCommerce, Email marketing, or niche platforms), WithOne already has the connectors built.
3. **Open Standards**: They support MCP (Model Context Protocol) natively, which means hooking it into your local AI agents or the Rust backend will be highly standardized.

## Technical Plan

### 1. Database Integration

- Exactly like the Composio plan, we will add a new connection type to the `social_connections` table (e.g., `service = 'withone'`).
- The user will authenticate their various social accounts via WithOne's unified OAuth flow, and we store the resulting connection IDs in BusinessKit.

### 2. Historical Data Syncing

- Use WithOne's massive API library to query historical posts from Instagram, Twitter, LinkedIn, etc.
- Map the JSON responses from WithOne into BusinessKit's local `social_posts` table schema.

### 3. Publishing Engine (Future)

- Since WithOne has a massive free tier, you could potentially route *all* publishing requests through them instead of directly hitting native APIs or Zernio, completely offloading the API maintenance burden.

## Next Steps (Post-Zernio)

1. **Evaluate API Schemas**: Compare WithOne's JSON responses for social posting/fetching against Zernio's to see how much translation logic is needed in the Rust backend.
2. **Add Connection Button**: Add "Connect via WithOne" to the `/accounts` page.
3. **Build Sync Task**: Write a Tauri command to fetch historical data via WithOne and populate the local calendar.

*Created for later reference when deciding between Composio and WithOne for extended integrations.*

<https://www.withone.ai/pricing>
<https://github.com/withoneai>
