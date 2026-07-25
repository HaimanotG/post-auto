# Graph Report - .  (2026-07-25)

## Corpus Check
- 206 files · ~74,586 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1191 nodes · 2143 edges · 88 communities (79 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.87)
- Token cost: 917,250 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI Auto-Reply Task (Trigger.dev)|AI Auto-Reply Task (Trigger.dev)]]
- [[_COMMUNITY_Slide Rendering Pipeline (Satoriresvg)|Slide Rendering Pipeline (Satori/resvg)]]
- [[_COMMUNITY_API Auth & Business Context|API Auth & Business Context]]
- [[_COMMUNITY_Inbox & OAuth Routes|Inbox & OAuth Routes]]
- [[_COMMUNITY_Shared TS Config (composite)|Shared TS Config (composite)]]
- [[_COMMUNITY_Meta Graph API Rationale & Error Handling|Meta Graph API Rationale & Error Handling]]
- [[_COMMUNITY_Root Monorepo Config|Root Monorepo Config]]
- [[_COMMUNITY_Platform Labels & Inbox Thread UI|Platform Labels & Inbox Thread UI]]
- [[_COMMUNITY_Trigger.dev WebhookEngagement Tasks|Trigger.dev Webhook/Engagement Tasks]]
- [[_COMMUNITY_Marketplace Listing Formatter|Marketplace Listing Formatter]]
- [[_COMMUNITY_Instagram Engagement Fetch|Instagram Engagement Fetch]]
- [[_COMMUNITY_AI Package Dependencies (LangChain)|AI Package Dependencies (LangChain)]]
- [[_COMMUNITY_API Package Dependencies (Fastify)|API Package Dependencies (Fastify)]]
- [[_COMMUNITY_Graph API Client & Usage Tracking|Graph API Client & Usage Tracking]]
- [[_COMMUNITY_Miniapp App Shell|Miniapp App Shell]]
- [[_COMMUNITY_Post Composer UI|Post Composer UI]]
- [[_COMMUNITY_Facebook Publish Task|Facebook Publish Task]]
- [[_COMMUNITY_Social Package Dependencies|Social Package Dependencies]]
- [[_COMMUNITY_Trigger App Dependencies & CI|Trigger App Dependencies & CI]]
- [[_COMMUNITY_Toast & Connect Facebook Button|Toast & Connect Facebook Button]]
- [[_COMMUNITY_AuthGate & Telegram Auth|AuthGate & Telegram Auth]]
- [[_COMMUNITY_Instagram Publish Photo|Instagram Publish Photo]]
- [[_COMMUNITY_Shared Package Dependencies|Shared Package Dependencies]]
- [[_COMMUNITY_Prisma DB Schema Tables|Prisma DB Schema Tables]]
- [[_COMMUNITY_Telegram WebApp Theme|Telegram WebApp Theme]]
- [[_COMMUNITY_Env Loading (APITriggerShared)|Env Loading (API/Trigger/Shared)]]
- [[_COMMUNITY_Facebook Engagement Fetch|Facebook Engagement Fetch]]
- [[_COMMUNITY_Miniapp Dev Dependencies|Miniapp Dev Dependencies]]
- [[_COMMUNITY_Analytics Dashboard|Analytics Dashboard]]
- [[_COMMUNITY_Threads Publish & Webhook Signing|Threads Publish & Webhook Signing]]
- [[_COMMUNITY_Header Context|Header Context]]
- [[_COMMUNITY_Marketplace Routes & Icons|Marketplace Routes & Icons]]
- [[_COMMUNITY_Graph API Error Taxonomy|Graph API Error Taxonomy]]
- [[_COMMUNITY_DB Migrations & Feature Overview|DB Migrations & Feature Overview]]
- [[_COMMUNITY_API TS Config|API TS Config]]
- [[_COMMUNITY_Render Package TS Config|Render Package TS Config]]
- [[_COMMUNITY_Config Package Manifest|Config Package Manifest]]
- [[_COMMUNITY_Project Architecture Rationale (PLANREADMEprd)|Project Architecture Rationale (PLAN/README/prd)]]
- [[_COMMUNITY_Miniapp Core Dependencies (React Router)|Miniapp Core Dependencies (React Router)]]
- [[_COMMUNITY_Onboarding Home Screen|Onboarding Home Screen]]
- [[_COMMUNITY_Render Package Dependencies (Satori)|Render Package Dependencies (Satori)]]
- [[_COMMUNITY_AI Package TS Config|AI Package TS Config]]
- [[_COMMUNITY_Carousel Editor|Carousel Editor]]
- [[_COMMUNITY_DB Package Dependencies (Prisma)|DB Package Dependencies (Prisma)]]
- [[_COMMUNITY_Miniapp LintTS Config|Miniapp Lint/TS Config]]
- [[_COMMUNITY_Shared Package TS Config|Shared Package TS Config]]
- [[_COMMUNITY_API Dev Dependencies|API Dev Dependencies]]
- [[_COMMUNITY_Config Package Dev Dependencies|Config Package Dev Dependencies]]
- [[_COMMUNITY_DB Package Scripts|DB Package Scripts]]
- [[_COMMUNITY_Miniapp Package Scripts|Miniapp Package Scripts]]
- [[_COMMUNITY_Miniapp TS Config|Miniapp TS Config]]
- [[_COMMUNITY_Trigger App TS Config|Trigger App TS Config]]
- [[_COMMUNITY_DB Package Dev Dependencies|DB Package Dev Dependencies]]
- [[_COMMUNITY_Render Package Dev Dependencies|Render Package Dev Dependencies]]
- [[_COMMUNITY_Trigger App Dev Dependencies|Trigger App Dev Dependencies]]
- [[_COMMUNITY_Render Package Scripts|Render Package Scripts]]
- [[_COMMUNITY_Hello World Trigger Task|Hello World Trigger Task]]
- [[_COMMUNITY_Claude Settings Permissions|Claude Settings Permissions]]
- [[_COMMUNITY_Config Package Exports|Config Package Exports]]
- [[_COMMUNITY_PRD Task Queue|PRD Task Queue]]
- [[_COMMUNITY_AI Package Build Config|AI Package Build Config]]
- [[_COMMUNITY_Miniapp Stack & Auth Flow Rationale|Miniapp Stack & Auth Flow Rationale]]
- [[_COMMUNITY_Ralph Autonomous Loop Script|Ralph Autonomous Loop Script]]
- [[_COMMUNITY_Shared Package Build Config|Shared Package Build Config]]
- [[_COMMUNITY_Trigger App Build Config|Trigger App Build Config]]
- [[_COMMUNITY_Root Workspace & Turborepo Pipeline|Root Workspace & Turborepo Pipeline]]
- [[_COMMUNITY_SharedSocial Package Pairing|Shared/Social Package Pairing]]
- [[_COMMUNITY_Miniapp Prod Fallback URL|Miniapp Prod Fallback URL]]
- [[_COMMUNITY_Project Identity (PostAuto)|Project Identity (PostAuto)]]
- [[_COMMUNITY_Telegram InitData Max Age Constant|Telegram InitData Max Age Constant]]

## God Nodes (most connected - your core abstractions)
1. `GraphClient` - 41 edges
2. `Platform` - 27 edges
3. `buildApp()` - 21 edges
4. `db package public entrypoint (index.ts)` - 21 edges
5. `createFixturePrismaStore()` - 19 edges
6. `compilerOptions` - 18 edges
7. `useAuth()` - 16 edges
8. `SlideBusiness` - 15 edges
9. `GraphApiError` - 15 edges
10. `AuthGate()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `formatMarketplaceListing()` --references--> `Facebook Marketplace assist (prepare, don't auto-post)`  [EXTRACTED]
  packages/social/src/marketplace/format-listing.ts → PLAN.md
- `Postgres data model via Prisma` --references--> `Migration: add rendered_slides`  [INFERRED]
  PLAN.md → packages/db/prisma/migrations/20260719000000_add_rendered_slides/migration.sql
- `Postgres data model via Prisma` --references--> `Migration: add M3 inbox/AI/webhook tables`  [INFERRED]
  PLAN.md → packages/db/prisma/migrations/20260719120000_add_m3_inbox_ai_webhook_tables/migration.sql
- `Postgres data model via Prisma` --references--> `Migration: add engagement_snapshots`  [INFERRED]
  PLAN.md → packages/db/prisma/migrations/20260719180000_add_engagement_snapshots/migration.sql
- `loadEnv` --references--> `decryptToken()`  [AMBIGUOUS]
  apps/api/src/env.ts → packages/shared/src/crypto.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Narrow structural PrismaClient-subset interface pattern** — lib_business_context_businesscontextstore, routes_analytics_analyticsstore, routes_inbox_inboxstore, routes_oauth_oauthstore, routes_posts_poststore, routes_webhooks_meta_webhookeventstore, middleware_telegram_init_data_telegramuserstore [EXTRACTED 1.00]
- **Duplicated buildFixtureApp/signJwt test helper scaffolding across route test files** — routes_analytics_test_buildfixtureapp, routes_inbox_test_buildfixtureapp, routes_oauth_test_buildfixtureapp, routes_posts_test_buildfixtureapp, routes_webhooks_meta_test_buildfixtureapp, routes_analytics_test_signjwt, routes_inbox_test_signjwt, routes_oauth_test_signjwt, routes_posts_test_signjwt [INFERRED 0.90]
- **Auth + business-resolution flow shared by every M1 business-scoped route** — lib_business_context_requireauthenticateduser, lib_business_context_resolveownedbusiness, routes_analytics_registeranalyticsroutes, routes_inbox_registerinboxroutes, routes_posts_registerpostsroutes, routes_oauth_registeroauthroutes [INFERRED 0.85]
- **Shared @postauto/config across miniapp tooling** — miniapp_eslint_config, miniapp_tsconfig, miniapp_tsconfig_node, miniapp_package, postauto_config [INFERRED 0.85]
- **Telegram Mini App SDK integration pattern** — miniapp_index, app_authgate_telegramwebapp, app_theme_resolveinitialtheme, app_appshell_header, src_main_main [INFERRED 0.85]
- **App shell header/tab navigation architecture** — src_routes_router, app_appshell_appshell, app_appshell_header, app_headercontext_usesetheader [INFERRED 0.80]
- **Discriminated-Union Status State Machine Pattern** — analytics_dashboard_dashboard, inbox_inboxscreen, onboarding_oauthstatuspoller, composer_postcomposer [INFERRED 0.85]
- **Local Type Mirroring of packages/db/prisma/schema.prisma Convention** — inbox_needsattentionbadge_inboxmessagestatus, composer_templatepicker_slidetemplateid, inbox_conversationthread_aireplydecisionsummary, inbox_inboxlist_inboxmessagesummary [INFERRED 0.90]
- **Workarounds for Meta/Telegram Platform API Limitations** — marketplace_preparelisting, onboarding_connectfacebookbutton, onboarding_oauthstatuspoller [INFERRED 0.85]
- **Narrow Prisma Store Interface Pattern** — tasks_classify_and_reply_classifyandreplystore, tasks_collect_engagement_snapshots_collectengagementsnapshotsstore, tasks_process_meta_webhook_processmetawebhookstore, tasks_publish_post_publishpoststore, tasks_render_slides_renderslidesstore [EXTRACTED 0.90]
- **Pure Orchestration with Injectable Deps Pattern** — tasks_classify_and_reply_runclassifyandreply, tasks_collect_engagement_snapshots_runcollectengagementsnapshots, tasks_process_meta_webhook_runprocessmetawebhook, tasks_publish_post_runpublishpost, tasks_render_slides_runrenderslides [INFERRED 0.85]
- **Auto-reply pipeline flow: classify -> gate -> generate, orchestrated by runAiEval** — pipelines_intent_classification_classifyintent, pipelines_intent_classification_gateintentdecision, pipelines_reply_generation_generatereply, eval_run_eval_runaieval [EXTRACTED 1.00]
- **No-credential (heuristic) AI eval harness** — eval_dataset_ai_eval_cases, eval_heuristic_classifier_heuristicclassifyintent, eval_heuristic_classifier_heuristicgeneratereply, eval_run_eval_runaieval, eval_cli_main [EXTRACTED 1.00]
- **M1 Core Schema: Plan, Migration, Test, Task all implement the same schema** — plan_data_model, 20260718061912_init_m1_core_tables_migration, src_client_test, prd_task_queue [INFERRED 0.85]
- **Ralph autonomous build loop pattern** — ralph_loop_harness, prd_task_queue, progress_build_log, plan_autonomous_build_loop_notes [INFERRED 0.85]
- **Meta Graph API rate-limit and error-handling subsystem** — plan_meta_graph_api_integration, plan_graph_client_wrapper, progress_graph_client_backoff_design, progress_error_taxonomy [INFERRED 0.80]
- **Branded slide templates share dom helpers and the SlideBusiness type** — templates_carouselcoverslide_carouselcoverslide, templates_carouseldetailslide_carouseldetailslide, templates_pricehighlightslide_pricehighlightslide, templates_singleproductslide_singleproductslide, templates_types_slidebusiness [INFERRED 0.85]
- **Satori tree -> SVG -> PNG -> uploaded slide render pipeline** — src_render_rendertreetosvg, src_render_svgtopng, src_render_rendertreetopng, src_render_renderslide, src_storage_objectstorage [EXTRACTED 1.00]
- **Inter font bundled locally for runtime and test use (no network access)** — fonts_readme, fixtures_readme, src_fonts_loaddefaultfonts [EXTRACTED 1.00]
- **Platform caption/hashtag adaptation pipeline** — src_constants_platform_caption_limits, src_adapt_post_platform_hashtag_limits, src_adapt_post_adaptposttoplatformvariant [INFERRED 0.85]
- **Meta Graph API error classification pattern** — src_errors_buildgraphapierror, src_errors_classifygrapherrorcode, src_errors_classifygrapherrorstatus, src_errors_graphapierror [INFERRED 0.85]
- **Facebook Graph API integration via GraphClient** — facebook_publish_photo_publishphototofacebookpage, facebook_fetch_engagement_fetchfacebookpostengagement, src_graph_client_graphclient [INFERRED 0.75]
- **Two-step create-container-then-publish pattern (IG + Threads)** — instagram_publish_photo_publishphototoinstagram, threads_publish_post_publishthreadspost, src_graph_client_post [INFERRED 0.85]
- **Cross-platform engagement metrics normalization into EngagementMetrics** — instagram_fetch_engagement_fetchinstagrammediaengagement, threads_fetch_engagement_fetchthreadsmediaengagement, src_insights_engagementmetrics, src_insights_extractinsightmetric [INFERRED 0.85]
- **Facebook/Threads OAuth code and token exchange family** — src_oauth_exchangefacebookcodefortoken, src_oauth_exchangethreadscodefortoken, src_oauth_exchangethreadsforlonglivedtoken, src_graph_client_exchangeforlonglivedtoken [INFERRED 0.80]

## Communities (88 total, 9 thin omitted)

### Community 0 - "AI Auto-Reply Task (Trigger.dev)"
Cohesion: 0.06
Nodes (68): classify-and-reply.ts orchestration (referenced, exact path unconfirmed in this chunk), "AI_EVAL_CASES against the heuristic fallback" test suite, formatFailure(), hasLiveApiKey(), main(), AI_EVAL_CASES, AiEvalCase, heuristicClassifyIntent() (+60 more)

### Community 1 - "Slide Rendering Pipeline (Satori/resvg)"
Cohesion: 0.06
Nodes (65): test/fixtures README (Inter font test fixture), assets/fonts README (Inter font bundling), Font bundled locally due to no outbound network access, DEFAULT_FONT_PATH, loadDefaultFonts(), AspectRatioKey, Dimensions, getPlatformDimension() (+57 more)

### Community 2 - "API Auth & Business Context"
Cohesion: 0.06
Nodes (67): AuthenticatedUser, BusinessContextStore, requireAuthenticatedUser(), resolveOwnedBusiness(), buildDataCheckString(), createTelegramInitDataPreHandler(), FastifyRequest, TelegramInitDataError (+59 more)

### Community 3 - "Inbox & OAuth Routes"
Cohesion: 0.06
Nodes (56): StoredInboxMessage, StoredSocialAccount, AdaptedPostVariant, AdaptPostInput, adaptPostToPlatformVariant(), adaptPostToPlatformVariants(), composeCaptionText(), normalizeHashtag() (+48 more)

### Community 4 - "Shared TS Config (composite)"
Cohesion: 0.05
Nodes (38): compilerOptions, composite, declaration, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module (+30 more)

### Community 5 - "Meta Graph API Rationale & Error Handling"
Cohesion: 0.09
Nodes (35): Rationale: Fastify chosen for raw-body webhook verification, Single Graph API client wrapper (packages/social/src/graph-client.ts), Meta Graph API integration (OAuth + webhooks + rate limits), Graph API error taxonomy (classifyGraphErrorCode/Status, isRetryable), Rationale: fastify-raw-body unscoped package name gotcha, Rationale: backoff computed before next Graph API call, not the returning one, buildRedirectUri(), escapeHtml() (+27 more)

### Community 6 - "Root Monorepo Config"
Cohesion: 0.06
Nodes (31): devDependencies, turbo, typescript, engines, node, name, packageManager, private (+23 more)

### Community 7 - "Platform Labels & Inbox Thread UI"
Cohesion: 0.11
Nodes (21): PLATFORM_ACCOUNT_LABELS, PLATFORM_LABELS, platformAccountLabel(), platformLabel(), AiReplyDecisionSummary, AiReplyDecisionType, ConversationThread(), ConversationThreadProps (+13 more)

### Community 8 - "Trigger.dev Webhook/Engagement Tasks"
Cohesion: 0.11
Nodes (23): ClassifyAndReplyStore, CollectEngagementSnapshotsStore, CHANGE_NORMALIZERS, MetaMessagingEvent, MetaWebhookChange, MetaWebhookEntry, MetaWebhookEnvelope, MetaWebhookFrom (+15 more)

### Community 9 - "Marketplace Listing Formatter"
Cohesion: 0.11
Nodes (18): CopyIcon(), buildListingText(), deriveDescription(), deriveTitle(), firstNonEmptyLine(), formatMarketplaceListing(), formatPrice(), MarketplaceListing (+10 more)

### Community 10 - "Instagram Engagement Fetch"
Cohesion: 0.12
Nodes (19): fetchInstagramMediaEngagement(), FetchInstagramMediaEngagementParams, InstagramMediaEngagementResponse, server, fetchInstagramMediaEngagement test suite, PLAN.md: collect-engagement-snapshots cron, EngagementSnapshot (Prisma model, referenced), EngagementMetrics (+11 more)

### Community 11 - "AI Package Dependencies (LangChain)"
Cohesion: 0.09
Nodes (22): dependencies, @langchain/anthropic, @langchain/core, @langchain/openai, zod, devDependencies, @postauto/config, tsx (+14 more)

### Community 12 - "API Package Dependencies (Fastify)"
Cohesion: 0.09
Nodes (21): dependencies, fastify, @fastify/cors, @fastify/jwt, fastify-raw-body, @postauto/db, @postauto/shared, @postauto/social (+13 more)

### Community 13 - "Graph API Client & Usage Tracking"
Cohesion: 0.18
Nodes (16): GraphClient.buildUrl() (private), GraphClientOptions, GraphRequestOptions, GraphResponse, LongLivedTokenExchangeParams, LongLivedTokenResponse, parseJsonBody(), GraphClient.request() (+8 more)

### Community 14 - "Miniapp App Shell"
Cohesion: 0.17
Nodes (18): AppShell(), Header(), ROUTE_TITLES, TAB_ITEMS, TabBar(), TelegramWebAppBackButton, HeaderProvider(), BackIcon() (+10 more)

### Community 15 - "Post Composer UI"
Cohesion: 0.12
Nodes (12): CheckCircleIcon(), RemoveIcon(), AssetDraft, CreatedPost, PostComposer(), PostComposerProps, Status, DEFAULT_TEMPLATE_OPTIONS (+4 more)

### Community 16 - "Facebook Publish Task"
Cohesion: 0.16
Nodes (15): PublishPhotoParams, PublishPhotoResult, publishPhotoToFacebookPage(), server, publish-photo test suite, GraphApiError, PublishPostDeps, PublishPostPayload (+7 more)

### Community 17 - "Social Package Dependencies"
Cohesion: 0.10
Nodes (19): dependencies, @postauto/shared, zod, devDependencies, msw, @postauto/config, @types/node, typescript (+11 more)

### Community 18 - "Trigger App Dependencies & CI"
Cohesion: 0.10
Nodes (19): dependencies, @postauto/ai, @postauto/db, @postauto/render, @postauto/shared, @postauto/social, @trigger.dev/sdk, zod (+11 more)

### Community 19 - "Toast & Connect Facebook Button"
Cohesion: 0.13
Nodes (12): DEFAULT_API_BASE_URL, Toast(), ToastProps, ConnectFacebookButtonProps, StartOAuthResponse, Status, ConnectedSocialAccount, OAuthStatusPoller() (+4 more)

### Community 20 - "AuthGate & Telegram Auth"
Cohesion: 0.14
Nodes (11): AuthContext, AuthGateProps, AuthResponse, AuthState, AuthUser, Status, TelegramWebAppUser, Consumer() (+3 more)

### Community 21 - "Instagram Publish Photo"
Cohesion: 0.14
Nodes (15): PublishPhotoResponse, CreateMediaContainerResponse, PublishInstagramPhotoParams, PublishInstagramPhotoResult, PublishMediaContainerResponse, publishPhotoToInstagram(), server, publishPhotoToInstagram test suite (+7 more)

### Community 22 - "Shared Package Dependencies"
Cohesion: 0.11
Nodes (17): dependencies, zod, devDependencies, @postauto/config, @types/node, typescript, vitest, exports (+9 more)

### Community 23 - "Prisma DB Schema Tables"
Cohesion: 0.22
Nodes (14): business_members table, businesses table, oauth_states table, post_platform_variants table, post_source_assets table, posts table, social_accounts table, users table (+6 more)

### Community 24 - "Telegram WebApp Theme"
Cohesion: 0.17
Nodes (9): AuthGate(), TelegramWebApp, resolveInitialTheme(), ThemeContext, ThemeName, ThemeProvider(), App bootstrap (main.tsx), rootElement (+1 more)

### Community 25 - "Env Loading (API/Trigger/Shared)"
Cohesion: 0.19
Nodes (12): loadEnv(), loadEnv(), ApiEnv, apiEnvSchema, baseEnvSchema, createEnv(), EnvValidationError, nodeEnvSchema (+4 more)

### Community 26 - "Facebook Engagement Fetch"
Cohesion: 0.19
Nodes (7): FacebookPostEngagementResponse, fetchFacebookPostEngagement(), FetchFacebookPostEngagementParams, server, fetch-engagement test suite, GraphClient, server

### Community 27 - "Miniapp Dev Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, eslint-plugin-react-hooks, eslint-plugin-react-refresh, jsdom, tailwindcss, @tailwindcss/vite, @testing-library/jest-dom, @testing-library/react (+7 more)

### Community 28 - "Analytics Dashboard"
Cohesion: 0.19
Nodes (10): AnalyticsPlatform, AnalyticsResponse, Dashboard(), DashboardProps, EngagementTotals, PlatformTotals, PostAnalytics, PostVariantAnalytics (+2 more)

### Community 29 - "Threads Publish & Webhook Signing"
Cohesion: 0.15
Nodes (8): verifyMetaWebhookSignature test suite, verifyMetaWebhookSignature(), CreateThreadsContainerResponse, PublishThreadsContainerResponse, PublishThreadsPostParams, PublishThreadsPostResult, server, Meta webhook signature validation docs

### Community 30 - "Header Context"
Cohesion: 0.21
Nodes (10): HeaderContext, HeaderContextValue, HeaderOverride, useHeaderContext(), useHeaderOverride(), useSetHeader(), InboxResponse, InboxScreen() (+2 more)

### Community 31 - "Marketplace Routes & Icons"
Cohesion: 0.17
Nodes (10): TabMarketplaceIcon(), analyticsRoute, composerRoute, inboxRoute, indexRoute, marketplaceRoute, MarketplaceRouteStub(), Register (+2 more)

### Community 32 - "Graph API Error Taxonomy"
Cohesion: 0.33
Nodes (11): Meta Graph API Error Handling Docs, AUTH_ERROR_CODES, buildGraphApiError(), classifyGraphErrorCode(), classifyGraphErrorStatus(), extractErrorBody(), GraphErrorBody, GraphErrorCategory (+3 more)

### Community 33 - "DB Migrations & Feature Overview"
Cohesion: 0.18
Nodes (12): Migration: init M1 core tables, Migration: add rendered_slides, Migration: add M3 inbox/AI/webhook tables, Migration: add engagement_snapshots, AI auto-reply pipeline (LangChain, provider-agnostic), Carousel/slide rendering (Satori + resvg), Postgres data model via Prisma, Facebook Marketplace assist (prepare, don't auto-post) (+4 more)

### Community 34 - "API TS Config"
Cohesion: 0.18
Nodes (9): exclude, extends, compilerOptions, declaration, noEmit, outDir, rootDir, extends (+1 more)

### Community 35 - "Render Package TS Config"
Cohesion: 0.18
Nodes (9): exclude, extends, compilerOptions, declaration, noEmit, outDir, rootDir, extends (+1 more)

### Community 36 - "Config Package Manifest"
Cohesion: 0.20
Nodes (9): files, name, private, scripts, format:check, lint, type, version (+1 more)

### Community 37 - "Project Architecture Rationale (PLAN/README/prd)"
Cohesion: 0.20
Nodes (10): Rationale: notes for the autonomous build loop (credential-gated task policy), Hosting architecture rationale (Neon/Railway/Vercel/Trigger.dev Cloud), Monorepo layout (apps/ + packages/, pnpm+Turborepo), Phased build plan (M0-M5), Verification strategy (Trigger.dev dev mode, Meta Dev Mode, mocked CI), Rationale: credential_gated task mock-first policy, prd.json sequential task queue, progress.txt append-only build log (+2 more)

### Community 38 - "Miniapp Core Dependencies (React Router)"
Cohesion: 0.22
Nodes (8): dependencies, react, react-dom, @tanstack/react-router, name, private, type, version

### Community 39 - "Onboarding Home Screen"
Cohesion: 0.25
Nodes (4): AccountsStatus, HomeScreen(), HomeScreenProps, InboxCountResponse

### Community 40 - "Render Package Dependencies (Satori)"
Cohesion: 0.22
Nodes (8): dependencies, @resvg/resvg-js, satori, exports, name, private, type, version

### Community 41 - "AI Package TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, declaration, noEmit, outDir, rootDir, extends, include

### Community 42 - "Carousel Editor"
Cohesion: 0.32
Nodes (5): CarouselEditor(), CarouselEditorProps, CarouselSlideDraft, moveItem(), moveItem()

### Community 43 - "DB Package Dependencies (Prisma)"
Cohesion: 0.25
Nodes (7): dependencies, @prisma/client, exports, name, private, type, version

### Community 44 - "Miniapp Lint/TS Config"
Cohesion: 0.25
Nodes (6): @postauto/config, compilerOptions, types, extends, include, @postauto/config workspace package

### Community 45 - "Shared Package TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, declaration, noEmit, outDir, rootDir, extends, include

### Community 46 - "API Dev Dependencies"
Cohesion: 0.29
Nodes (7): devDependencies, msw, @postauto/config, tsx, @types/node, typescript, vitest

### Community 47 - "Config Package Dev Dependencies"
Cohesion: 0.29
Nodes (7): devDependencies, eslint, eslint-config-prettier, @eslint/js, prettier, typescript, typescript-eslint

### Community 48 - "DB Package Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, generate, lint, migrate:dev, test, typecheck

### Community 49 - "Miniapp Package Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, preview, test, typecheck

### Community 50 - "Miniapp TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, jsx, lib, types, extends, include

### Community 51 - "Trigger App TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, declaration, noEmit, outDir, extends, include

### Community 52 - "DB Package Dev Dependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @postauto/config, prisma, @types/node, typescript, vitest

### Community 53 - "Render Package Dev Dependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @postauto/config, @types/node, @types/react, typescript, vitest

### Community 54 - "Trigger App Dev Dependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @postauto/config, @trigger.dev/build, @types/node, typescript, vitest

### Community 55 - "Render Package Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, lint, test, typecheck

### Community 56 - "Hello World Trigger Task"
Cohesion: 0.60
Nodes (3): buildGreeting(), HelloWorldPayload, helloWorldTask

### Community 57 - "Claude Settings Permissions"
Cohesion: 0.50
Nodes (3): permissions, allow, deny

### Community 58 - "Config Package Exports"
Cohesion: 0.50
Nodes (4): exports, ./eslint, ./prettier, ./tsconfig.base.json

### Community 59 - "PRD Task Queue"
Cohesion: 0.50
Nodes (3): notes, plan_file, tasks

### Community 61 - "Miniapp Stack & Auth Flow Rationale"
Cohesion: 0.67
Nodes (3): Mini app frontend stack (React+Vite+telegram-apps SDK+Tailwind+TanStack), Telegram initData authentication flow, Rationale: AuthGate avoids persisting JWT, re-sends fresh initData on relaunch

## Ambiguous Edges - Review These
- `posts.ts` → `PostComposer.tsx`  [AMBIGUOUS]
  apps/miniapp/src/features/composer/PostComposer.tsx · relation: references
- `runAiEval()` → `classify-and-reply.ts orchestration (referenced, exact path unconfirmed in this chunk)`  [AMBIGUOUS]
  packages/ai/src/eval/run-eval.ts · relation: conceptually_related_to
- `decryptToken()` → `loadEnv`  [AMBIGUOUS]
  apps/trigger/src/env.ts · relation: references

## Knowledge Gaps
- **491 isolated node(s):** `allow`, `deny`, `name`, `version`, `private` (+486 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `posts.ts` and `PostComposer.tsx`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `runAiEval()` and `classify-and-reply.ts orchestration (referenced, exact path unconfirmed in this chunk)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `decryptToken()` and `loadEnv`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `@postauto/config workspace package` connect `Miniapp Lint/TS Config` to `Miniapp Core Dependencies (React Router)`, `AI Package Dependencies (LangChain)`, `API Dev Dependencies`, `Social Package Dependencies`, `Miniapp TS Config`, `DB Package Dev Dependencies`, `Render Package Dev Dependencies`, `Shared Package Dependencies`, `Trigger App Dev Dependencies`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `main()` connect `AI Auto-Reply Task (Trigger.dev)` to `AI Package Dependencies (LangChain)`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Why does `db package public entrypoint (index.ts)` connect `API Auth & Business Context` to `AI Auto-Reply Task (Trigger.dev)`, `Slide Rendering Pipeline (Satori/resvg)`, `Inbox & OAuth Routes`, `Meta Graph API Rationale & Error Handling`, `Trigger.dev Webhook/Engagement Tasks`, `Facebook Publish Task`, `Env Loading (API/Trigger/Shared)`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **What connects `allow`, `deny`, `name` to the rest of the system?**
  _499 weakly-connected nodes found - possible documentation gaps or missing edges._