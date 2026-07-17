# PostAuto

Ethiopian SMB retail operating system — a Telegram Mini App that unifies social media posting,
customer engagement, and analytics for small businesses.

See [PLAN.md](./PLAN.md) for the full architecture and phased build plan, and [prd.json](./prd.json)
for the task queue driving the autonomous build loop.

## Monorepo layout

```
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
```

## Tooling

- **Package manager**: pnpm workspaces
- **Build orchestration**: Turborepo
- **Language**: TypeScript

## Getting started

```sh
pnpm install
pnpm turbo build
pnpm turbo test
pnpm turbo typecheck
```
