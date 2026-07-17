# PostAuto — Ethiopian SMB Retail Operating System (Telegram Mini App)

## Context

The user wants to build a "retail operating system" for Ethiopian small businesses that unifies social media posting, customer engagement, and analytics — starting as a **Telegram Mini App**, with a web frontend and inventory/voice-command features planned as future pivots. The repo (`postauto`) is currently empty — this is a greenfield architecture and phased build plan, not a change to existing code.

Through clarifying questions, the following scope and constraints were established:

- **v1 platforms**: Facebook Page + Instagram Business + Threads (one Meta App covers all three via Graph API). **TikTok, X, and LinkedIn are explicitly out of v1** — TikTok's unaudited-app tier can't direct-publish (draft-inbox only), X requires paid API tiers, LinkedIn company-page posting needs partner access. YouTube is out entirely (different content type — video — not a "post").
- **Facebook Marketplace**: Meta provides **no public API to create Marketplace listings**. This will be a "prepare, don't auto-post" assist flow, not real automation.
- **Account linking**: self-serve OAuth only — no guided wizard, no white-glove onboarding. Some sellers getting stuck on Meta's Business Page/IG Business-account prerequisites is an accepted v1 limitation.
- **Language**: English only for v1 (no Amharic/multilingual NLP yet, but prompts/strings kept separable for later).
- **Stack**: TypeScript backend, Postgres, Trigger.dev for scheduling/job orchestration, LangChain for AI orchestration in a **provider-agnostic** way (Claude and OpenAI, swappable per task).
- **Future-proofing required, not built now**: inventory (`products`/`variants`), and voice commands feeding the same intent-router as chat.

## Recommended Architecture

### Monorepo layout
```
postauto/
  apps/
    miniapp/    # Telegram Mini App frontend (React + TS + Vite)
    api/        # Fastify backend: REST routes, OAuth callbacks, Meta webhook receiver
    trigger/    # Trigger.dev v3 project (job/task definitions)
  packages/
    db/         # Prisma schema, migrations, client, seed scripts
    social/     # Meta Graph API client + per-platform adapters + post-adaptation logic
    ai/         # LangChain: model router, intent classification, reply generation, prompts
    render/     # Satori + resvg template rendering engine + slide templates
    shared/     # Cross-cutting TS types/zod schemas, env validation, constants
    config/     # Shared tsconfig/eslint/prettier
  turbo.json
  pnpm-workspace.yaml
```

**Tooling:** pnpm workspaces + Turborepo. **ORM: Prisma** (schema will churn early — products/variants, intents, analytics — Prisma's declarative diffing + Prisma Studio suit a non-technical founder eyeballing data better than Drizzle's edge-speed advantage, which isn't relevant here). **Backend framework: Fastify** (needs raw-body access for Meta's `X-Hub-Signature-256` webhook verification, mature TS support, proven for lean webhook receivers that must ack Meta within seconds).

**Hosting:** Postgres on **Neon** (serverless, branch-per-preview, pooled connections for Fastify + Trigger.dev sharing one DB). API on **Railway** (persistent process needed for webhook receivers, stable HTTPS for OAuth callback + webhook URLs Meta requires). Mini app frontend on **Vercel** (static Vite build, per-PR preview URLs). Jobs on **Trigger.dev Cloud** (managed, no worker infra to own).

**Frontend:** React + TypeScript + Vite + `@telegram-apps/sdk` (initData, theme, haptics, back button) + `@telegram-apps/telegram-ui` (native Telegram look) + Tailwind (custom composer/analytics screens) + TanStack Query + Zustand + TanStack Router (Composer / Inbox / Analytics / Marketplace tabs).

**Telegram auth:** Frontend reads `window.Telegram.WebApp.initData`, sends it to `POST /auth/telegram`. Backend middleware (`apps/api/src/middleware/telegram-init-data.ts`) validates the HMAC-SHA256 signature (`secret = HMAC-SHA256("WebAppData", BOT_TOKEN)`), rejects stale `auth_date` (>24h), upserts `users` by `telegram_user_id`, mints a short-lived JWT (~1h). Mini app re-sends fresh `initData` on relaunch rather than relying on WebView cookies.

### Component flow
```
Telegram client --embeds--> Mini App (Vercel)
      |initData (signed)         |REST/JSON (JWT)
      v                          v
                 API (Railway, Fastify)
                 /auth/telegram  /oauth/:platform/*  /posts  /inbox  /analytics
                 /webhooks/meta  <-- Meta Graph API webhooks (FB/IG/Threads)
                         |
              enqueues via Trigger.dev SDK
                         v
                 Trigger.dev Cloud (apps/trigger)
                 publish-post · render-slides · process-meta-webhook
                 classify-and-reply · collect-engagement-snapshots (cron)
                 refresh-meta-tokens (cron)
              /                                    \
   packages/social                          packages/ai (LangChain)
   Graph API client, adapters,              model-router -> Claude/OpenAI
   post-adaptation, marketplace-assist      intent classification, reply gen
              |
   Meta Graph API (graph.facebook.com, graph.threads.net)

   packages/render (Satori+resvg) --> object storage (rendered slides/media)
   packages/db (Prisma) --> Postgres (Neon)
```

All Graph API calls go through one client wrapper (`packages/social/src/graph-client.ts`) so rate-limit handling, token refresh, and error taxonomy exist once, not per-platform.

### Data model (Postgres via Prisma)

- `businesses`(id, name, telegram_owner_user_id, timezone, brand_colors jsonb, logo_asset_url)
- `users`(id, telegram_user_id unique, username, first_name, photo_url)
- `business_members`(business_id, user_id, role: owner/staff)
- `social_accounts`(business_id, platform: facebook_page/instagram_business/threads, external_account_id, access_token_encrypted, token_expires_at, scopes, status: active/revoked/error)
- `oauth_states`(business_id, user_id, platform, state_token, consumed_at) — CSRF protection
- `posts`(business_id, status: draft/scheduled/publishing/published/failed/partial, caption_master, **product_id nullable FK — reserved for future `products` table**, scheduled_at)
- `post_source_assets`(post_id, raw upload url, product_name, price, description, order_index)
- `rendered_slides`(post_id, slide_index, template_id, platform, width, height, file_url)
- `post_platform_variants`(post_id, platform, variant_status, caption_text, hashtags, media_urls, external_post_id, external_permalink, error_message, retry_count)
- `inbox_messages`(business_id, social_account_id, platform, type: comment/mention/dm, external_message_id unique, related_post_id nullable, sender info, body, status: new/auto_replied/needs_attention/resolved/ignored)
- `ai_reply_decisions`(inbox_message_id, model_used, intent_classified, confidence, decision: auto_reply/escalate/ignore, reply_text, reasoning_snippet) — audit log + future eval dataset
- `engagement_snapshots`(post_platform_variant_id, captured_at, likes_count, comments_count, shares_count, reach, impressions)
- `webhook_events`(platform, external_object_type, raw_payload jsonb, processing_status) — idempotent raw store

**Future extension points (additive, no rewrite):**
- `products`/`product_variants` — `posts.product_id` is already reserved; `ai_reply_decisions` generation already joins `inbox_messages.related_post_id -> posts.product_id`, so wiring in live price/stock later is a pure additive join.
- `commands`(business_id, user_id, source: telegram_chat/voice/quick_action, raw_input_text, raw_audio_url, transcribed_text, parsed_intent, parsed_entities, resulting_action_ref_id) — a generic intent-router sharing the same `classifyIntent()` function as auto-reply, so voice/STT plugs into the same intent→action layer instead of a parallel system.

### Meta Graph API integration

One Meta App: Facebook Login for Business (`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`, `business_management`) plus Threads API's own OAuth grant (`threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_manage_insights`), same App dashboard.

OAuth flow: mini app opens OAuth URL in Telegram's external browser → HTTPS callback exchanges `code` → short-lived → long-lived (60-day) token → `GET /me/accounts` for Page tokens (IG Business account via Page's `instagram_business_account` field) → Threads' own `th_exchange_token` cycle. Since a WebView can't reliably `postMessage` back after an external redirect, the callback shows a "return to Telegram" screen and the bot sends a deep link (`t.me/<bot>?startapp=oauth_success`) to relaunch the mini app, which polls `/oauth/status`.

Webhooks: single `/webhooks/meta` route handles the verification handshake and all subscribed events (Page feed/comments/mentions/messages, IG comments/mentions/messages, Threads replies). Validates `X-Hub-Signature-256`, persists raw payload to `webhook_events` immediately (idempotency/ack-speed), enqueues a Trigger.dev task.

Rate limits: `graph-client.ts` reads `X-Business-Use-Case-Usage` and backs off as usage nears cap. Trigger.dev publish tasks use built-in retry/backoff for transient errors; permanent errors (policy violation, invalid media) mark `post_platform_variants.status=failed` without retry. Daily cron `refresh-meta-tokens` proactively refreshes tokens nearing expiry, notifies seller via Telegram bot message when reconnect is required.

### AI auto-reply (LangChain, provider-agnostic)

`packages/ai/src/model-router.ts` maps **task name → model** (`getModelForTask('intent-classification')`, `getModelForTask('reply-generation')`), config-driven across `@langchain/anthropic` and `@langchain/openai` (both `BaseChatModel`) — swapping/mixing providers per task is a config edit.

Pipeline: (1) cheap/fast model classifies intent with structured output (`{intent, confidence}`); (2) confidence + allowlist gate (price, availability, greeting, hours) — below threshold or not in allowlist → `ai_reply_decisions(decision=escalate)`, `inbox_messages.status=needs_attention`, seller notified; (3) stronger model generates on-brand reply from post caption + (future) live product data + brand-voice settings; (4) persist decision, enqueue `publish-reply`. Prompt templates live as separate files under `packages/ai/src/prompts/`, not inline strings, so localization later is additive. Same `classifyIntent()` is the shared entry point for the future `commands` table.

### Carousel/slide rendering

**Satori + resvg-js** over Playwright (no headless-Chromium binary, fast cold starts, deterministic for flat-design branded templates). `packages/render/templates/*.tsx` are pure functions returning Satori trees (`SingleProductSlide`, `PriceHighlightSlide`, `CarouselCoverSlide`, `CarouselDetailSlide`). `render.ts` builds tree → SVG → PNG, uploads to object storage. `platform-dimensions.ts` holds per-platform target sizes (FB 1.91:1/1:1, IG 4:5/1:1, Threads mirrors IG) — **re-render the same template+props at each target dimension** rather than crop one raster, for crisp output. `packages/social/src/adapt-post.ts` builds `post_platform_variants` from master caption + correct per-platform slide set, truncating per platform limit (Threads' 500 chars is the binding constraint) and adjusting hashtag conventions.

### Facebook Marketplace assist

No listing-creation API exists, so this is client-side handoff, reusing the render pipeline with **no Meta API call and no Trigger.dev job**: render an unbranded product photo via `MarketplacePhoto.tsx`, "copy listing text" button, primary handoff via Web Share API (`navigator.share`) targeting the Facebook app directly with image+text, fallback link to `facebook.com/marketplace/create/item` with manual paste instructions. UI labeled "Prepare for Marketplace," not "Post to Marketplace."

### Phased build plan

- **M0 — Scaffolding**: pnpm/Turborepo init, Prisma against Neon dev branch, Trigger.dev project init, Fastify skeleton, CI (typecheck/lint/test).
- **M1 — Auth + account linking + single-platform (FB) single-image publish**: `apps/miniapp/src/app/AuthGate.tsx`, `features/onboarding/ConnectFacebookButton.tsx`, `features/composer/PostComposer.tsx`; `apps/api/src/middleware/telegram-init-data.ts`, `routes/auth.ts`, `routes/oauth.ts`, `routes/posts.ts`; `packages/db/prisma/schema.prisma` (businesses, users, business_members, social_accounts, posts, post_source_assets, post_platform_variants, oauth_states); `packages/social/src/graph-client.ts`, `facebook/publish-photo.ts`; `apps/trigger/src/tasks/publish-post.ts`.
- **M2 — Multi-platform adaptation + carousels**: `packages/social/src/instagram/*`, `threads/*`, `adapt-post.ts`; `packages/render/src/templates/*.tsx`, `render.ts`, `platform-dimensions.ts`; `apps/trigger/src/tasks/render-slides.ts`; `apps/miniapp/src/features/composer/TemplatePicker.tsx`, `CarouselEditor.tsx`; migration: `rendered_slides`.
- **M3 — Unified inbox + AI auto-reply**: `apps/api/src/routes/webhooks-meta.ts`; `apps/trigger/src/tasks/process-meta-webhook.ts`, `classify-and-reply.ts`; `packages/ai/src/model-router.ts`, `pipelines/intent-classification.ts`, `pipelines/reply-generation.ts`, `prompts/*.ts`; migration: `inbox_messages`, `ai_reply_decisions`, `webhook_events`; `apps/miniapp/src/features/inbox/InboxList.tsx`, `ConversationThread.tsx`, `NeedsAttentionBadge.tsx`.
- **M4 — Analytics**: `apps/trigger/src/tasks/collect-engagement-snapshots.ts` (cron); migration: `engagement_snapshots`; `apps/api/src/routes/analytics.ts`, `apps/miniapp/src/features/analytics/Dashboard.tsx`.
- **M5 — Marketplace assist**: `apps/miniapp/src/features/marketplace/PrepareListing.tsx`; `packages/social/src/marketplace/format-listing.ts`; `packages/render/src/templates/MarketplacePhoto.tsx`.

Adding TikTok/X/LinkedIn later = a new `packages/social/<platform>/` module implementing the same adapter interface (`publish`, `refreshToken`, `parseWebhook`) plus a `platform-dimensions.ts` entry — not a redesign. YouTube would additionally need a video content-type path (`post_assets.kind` reserves room for a `video` discriminator).

## Verification

- **Trigger.dev dev mode** (`trigger.dev dev`) runs tasks locally against real cloud orchestration; Vitest unit tests for pure logic (`adapt-post`, `model-router`, render template snapshots).
- **Meta Development Mode**: before App Review, use Test Users/Test Pages + an IG Tester account (App Dashboard Roles tab) to exercise the full OAuth → publish → webhook loop with real API calls — Advanced Access permissions work for admins/testers pre-review.
- **Webhook testing**: Meta App Dashboard's "Test" button sends real sample payloads to the verified callback URL; a dev-only endpoint also POSTs synthetic payloads directly to `/webhooks/meta` to exercise `process-meta-webhook` → `classify-and-reply` without waiting on live comments.
- **Stable HTTPS early**: both Telegram's mini app URL and Meta's webhook callback require HTTPS — stand up a persistent dev deploy (Railway/Vercel preview) early rather than relying on localhost+tunnel.
- **CI**: mock `graph-client` at the HTTP layer (`msw`/`nock`); gate real Meta-hitting tests behind `RUN_LIVE_META_TESTS=1` for manual smoke tests against test accounts.
- **AI eval**: maintain a small curated eval set (comment → expected intent/decision) run against the pipeline whenever prompts/model config change, since every decision is already logged in `ai_reply_decisions`.

## Notes for the autonomous build loop

This file is the architectural source of truth. `prd.json` breaks it into small, sequentially-ordered, independently verifiable tasks. Some tasks (OAuth against the real Meta App, live webhook delivery, actual deploys to Railway/Vercel/Trigger.dev Cloud) require secrets and accounts only the human owner can provide (`META_APP_ID`/`META_APP_SECRET`, `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `TRIGGER_SECRET_KEY`, Railway/Vercel project links). For those tasks: implement the code and cover it with mocked/fixture-based tests (`msw`/`nock`, a hardcoded test `X-Hub-Signature-256` secret, etc.), mark the task `passes: true` only once the mocked test suite is green, and record in `progress.txt` exactly what a human needs to supply before it can be exercised live. Do not fabricate a passing live-integration result.
