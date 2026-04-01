# Krux AI — Codebase Context for Cursor

## What This Product Does
Krux AI automates the migration of SAP ABAP legacy code to modern stacks (Node.js, React, etc.) for S/4HANA transitions. Users upload ABAP source files, the AI converts them, engineers review the output, and approved code is exported. The core loop: **Upload → Convert (AI) → Review → Approve → Export**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| API | tRPC v11 (type-safe, no REST) |
| DB Client | Prisma (PostgreSQL) |
| Auth | NextAuth.js v4 (sessions, Google/GitHub OAuth + credentials) |
| State | TanStack Query v5 (via tRPC) + React Context (project switcher) |
| Queue | BullMQ + Redis (AI conversion jobs) |
| Fonts | Cormorant Garamond (display), IBM Plex Mono (mono), JetBrains Mono |

---

## Project Structure

```
app/
  (dashboard)/          # Authenticated app shell (layout wraps with ProjectProvider)
    layout.tsx          # Auth guard, sidebar + header, wraps in <ProjectProvider>
    dashboard/page.tsx  # Server component, direct DB queries for stats
    projects/
      page.tsx          # Client component, tRPC project list with status filters
      [id]/page.tsx     # Server component, project detail + recent objects (clickable → /review)
      new/page.tsx      # Client component, opens CreateProjectDialog on mount
    migration/page.tsx  # Client component, object list, checkboxes, SSE progress
    review/page.tsx     # Client component, side-by-side review queue + CodeEditor
    analytics/page.tsx
    team/page.tsx
    settings/
      page.tsx
      profile/page.tsx  # Redirects to /settings
  page.tsx              # Public landing page
  api/
    auth/[...nextauth]/ # NextAuth handler
    trpc/[trpc]/        # tRPC handler
    sse/conversion/     # Server-Sent Events for live conversion progress

components/
  layout/
    sidebar.tsx         # Collapsible, uses useProject() to inject ?projectId= for /migration and /review
    header.tsx          # Project switcher dropdown (real tRPC data), user menu, breadcrumb
  providers/
    project-provider.tsx  # Global project context, persists to localStorage("krux_project")
    session-provider.tsx
    query-provider.tsx
  projects/
    create-project-dialog.tsx  # Controlled + uncontrolled dialog, calls setProject on success
    project-card.tsx
  editor/
    code-editor.tsx     # Custom ABAP editor: macOS title bar, line numbers, syntax highlighting,
                        # transparent textarea overlay on top of highlighted mirror div
  migration/
    upload-dialog.tsx   # Upload .abap files
  dashboard/
    stats-card.tsx
    recent-projects.tsx
    activity-feed.tsx
  landing/
    landing-client.tsx  # Landing page client component (scroll reveals, animated code panel)
    waitlist-form.tsx

server/
  trpc.ts               # tRPC init, context (db + session), middleware
  routers/
    _app.ts             # Root router: user, project, migration, sap, analytics
    project.ts          # list, byId, create, update, delete, auditLog, dashboardStats
    migration.ts        # listObjects, objectById, uploadObjects, enqueueConversion,
                        #   submitReview, pendingReview
    user.ts
    sap.ts
    analytics.ts
  jobs/
    queue.ts            # BullMQ migrationQueue

lib/
  db.ts                 # Prisma client singleton
  redis.ts              # ioredis singleton
  trpc.ts               # createTRPCReact<AppRouter> — client-side tRPC hook
  auth.ts               # NextAuth authOptions
  utils.ts              # cn(), getStatusColor(), formatRelativeTime(), formatConfidenceScore()

prisma/
  schema.prisma         # Full schema (see below)
```

---

## Database Schema (Prisma)

```
User           — id, email, name, passwordHash, role(ADMIN|REVIEWER|VIEWER), organizationId
Organization   — id, name, slug, plan(ASSESSMENT|MIGRATION|ENTERPRISE)
Project        — id, name, description, orgId, status(DRAFT|ACTIVE|PAUSED|COMPLETED|ARCHIVED),
                 sapSystemUrl, sapRelease, targetStack
MigrationObject— id, projectId, objectType, objectName, packageName, sourceCode, convertedCode,
                 confidenceScore(Float 0–1), status(PENDING|CONVERTING|CONVERTED|REVIEWED|APPROVED|FAILED),
                 errorMessage, processingTime(ms), tokenCount
ReviewDecision — id, objectId, userId, decision(APPROVED|REJECTED|MODIFIED), notes, modifiedCode
AuditLog       — id, projectId, userId, action(string), metadata(Json), timestamp
```

**ObjectType enum:** REPORT, FUNCTION_MODULE, CLASS, INTERFACE, DATA_ELEMENT, DOMAIN, TABLE, VIEW, PROGRAM, INCLUDE, METHOD, FORM_ROUTINE

---

## tRPC Router Reference

### `trpc.project`
| Procedure | Type | Input | Returns |
|---|---|---|---|
| `list` | query | `{ page?, limit?, status?, search? }` | `{ projects[], total, pages }` |
| `byId` | query | `{ id }` | `project + stats` |
| `create` | mutation | `{ name, description?, sapSystemUrl?, sapRelease?, targetStack?, orgId? }` | `project` |
| `update` | mutation | `{ id, name?, description?, status?, ... }` | `project` |
| `delete` | mutation (admin) | `{ id }` | `{ success }` |
| `auditLog` | query | `{ projectId, limit? }` | `AuditLog[]` |
| `dashboardStats` | query | — | `{ projectCount, totalObjects, approvedObjects, completionRate, objectStats, recentProjects }` |

### `trpc.migration`
| Procedure | Type | Input | Returns |
|---|---|---|---|
| `listObjects` | query | `{ projectId, page?, limit?, status?, objectType?, search? }` | `{ objects[], total, pages }` |
| `objectById` | query | `{ id }` | `MigrationObject + reviewDecisions[]` |
| `uploadObjects` | mutation | `{ projectId, objects[{ objectType, objectName, packageName?, sourceCode }] }` | `{ created }` |
| `enqueueConversion` | mutation | `{ projectId, objectIds[] }` | `{ enqueued }` |
| `submitReview` | mutation (reviewer+) | `{ objectId, decision, notes?, modifiedCode? }` | `ReviewDecision` |
| `pendingReview` | query (reviewer+) | `{ projectId?, limit? }` | `MigrationObject[]` |

---

## Key Patterns

### Adding a new tRPC route
1. Add procedure to the appropriate router in `server/routers/`
2. It's automatically typed — call it on the client via `trpc.<router>.<procedure>.useQuery/useMutation()`
3. Use `protectedProcedure` for auth-required, `adminProcedure` for admin-only, `reviewerProcedure` for reviewer+admin

### TanStack Query v5 (important gotcha)
Use `placeholderData: (prev) => prev` — NOT `keepPreviousData: true` (that's v4 API and will throw).

### Global Project State
`useProject()` from `@/components/providers/project-provider` gives `{ projectId, projectName, setProject, clearProject }`.
- Persisted in `localStorage("krux_project")`
- Call `setProject(id, name)` after creating/selecting a project
- Sidebar auto-appends `?projectId=` to `/migration` and `/review` when a project is active

### Adding a new dashboard page
1. Create `app/(dashboard)/your-page/page.tsx`
2. Add nav item to `components/layout/sidebar.tsx` in `navItems` or `bottomNavItems`
3. If it needs the active project, add the href to `PROJECT_AWARE` set in sidebar

### Auth & Session
- Server components: `getServerSession(authOptions)` from `next-auth`
- Client components: `useSession()` from `next-auth/react`
- `session.user` has: `id, email, name, image, role, organizationId`
- Role hierarchy: VIEWER < REVIEWER < ADMIN

### CSS conventions
- All global styles live in `app/globals.css`
- NO inline `<style>` tags in components — causes React hydration errors (server escapes `"` as `&quot;`, client doesn't)
- Custom CSS class prefixes: `.lp-*` (landing page), `.ced-*` (code editor), `.abstract-*` (sidebar/header panel styles)
- ABAP syntax colors: `.abap-kw`, `.abap-str`, `.abap-cmt`, `.abap-num`, `.abap-op`, `.abap-type`

### CodeEditor component
`components/editor/code-editor.tsx` — custom ABAP editor:
- Props: `value`, `onChange`, `readOnly?`, `language?`, `minHeight?`, `maxHeight?`, `label?`
- Renders a macOS-style title bar, line numbers, and a transparent `<textarea>` overlaid on a syntax-highlighted mirror `<div>`
- Tab key inserts 2 spaces (no focus trap)

---

## Status Color Mapping (`getStatusColor` in lib/utils.ts)
| Status | Color class |
|---|---|
| PENDING | yellow |
| CONVERTING | blue + animate-pulse |
| CONVERTED | purple |
| REVIEWED | indigo |
| APPROVED | green |
| FAILED | red |
| ACTIVE | green |
| DRAFT | gray |
| PAUSED | yellow |
| COMPLETED | blue |
| ARCHIVED | gray |

---

## Environment Variables

```env
DATABASE_URL=           # PostgreSQL connection string
REDIS_URL=              # Redis connection string (for BullMQ)
NEXTAUTH_SECRET=        # NextAuth secret
NEXTAUTH_URL=           # App base URL
ANTHROPIC_API_KEY=      # Claude API key for AI conversion
GOOGLE_CLIENT_ID=       # OAuth (optional)
GOOGLE_CLIENT_SECRET=   # OAuth (optional)
GITHUB_CLIENT_ID=       # OAuth (optional)
GITHUB_CLIENT_SECRET=   # OAuth (optional)
```

---

## Pages Reference

| Route | Type | Description |
|---|---|---|
| `/` | Public | Landing page |
| `/login` | Public | Auth page |
| `/dashboard` | Server | Stats overview |
| `/projects` | Client | Project list with status filters |
| `/projects/new` | Client | Opens create dialog immediately |
| `/projects/[id]` | Server | Project detail + recent objects |
| `/migration` | Client | Object list, bulk convert, SSE progress |
| `/review` | Client | Review queue + CodeEditor (supports `?objectId=` to pre-select) |
| `/analytics` | — | Analytics |
| `/team` | — | Team management |
| `/settings` | — | User settings |
| `/settings/profile` | Server | Redirects to `/settings` |

---

## Common Implementation Tasks

### New feature that reads from DB on a page
Prefer **server components** for pages that just display data — use `db.*` directly (no tRPC needed).
Use **client components** with tRPC only when you need interactivity, real-time updates, or user-triggered mutations.

### Adding a new object action in the review queue
1. Add a `ReviewDecisionType` value in `prisma/schema.prisma` + migrate
2. Add a new procedure (or extend `submitReview`) in `server/routers/migration.ts`
3. Add the UI button + handler in `app/(dashboard)/review/page.tsx`

### Uploading files
The `UploadDialog` component (`components/migration/upload-dialog.tsx`) handles `.abap` file upload and calls `trpc.migration.uploadObjects`. After upload, enqueue via `trpc.migration.enqueueConversion`.

### Export
Approved objects can be exported at `/api/projects/[id]/export?format=zip&status=APPROVED`.
