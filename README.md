# Platform Catering Talago — Monorepo

A digital business in food catering b2c and b2b (hybrid), focusing on selling lunch boxes (Nasi Kotak) with menus featuring traditional Padang cuisine for the Sintang city area, West Kalimantan.

| Persona | Aplication | Stack |
| :-- | :-- | :-- |
| Pelanggan | `apps/web` — storefront | Astro 7 (SSR, adapter Node) + SolidJS islands |
| Admin / dapur / kurir | `apps/dashboard` — dashboard internal | TanStack Start + SolidJS + TanStack Query, UI Kobalte (Tailwind v4) |
| Sistem | `apps/api` — API + worker | Hono di Node, `ROLE=web` atau `ROLE=worker` |
| Domain | `packages/core` | TypeScript + Drizzle ORM + SQL atomik |
| Contract | `packages/contracts` | Zod schema, enum, DTO, label UI |

Build & task runner: **Turborepo** + pnpm workspaces. Database: **PostgreSQL 16**. background queue:
**pg-boss** (without extended Redis/broker).

---
