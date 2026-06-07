# Atrevidos MVP Implementation Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Convert the current SvelteKit + Supabase prototype into a usable MVP for an adult social network focused on profiles, discovery, consent-aware matching, private messaging, and moderation.

**Architecture:** Keep Supabase as the backend system of record for auth, Postgres, RLS, realtime, and storage. Use SvelteKit for web UI. Build in layers: first make the app compile and authenticate correctly, then add profile/discovery/matching, then messaging/media, then moderation and launch hardening.

**Tech Stack:** SvelteKit, TypeScript, Tailwind CSS, Supabase Auth, Supabase Postgres, Supabase Realtime, Supabase Storage.

---

## Product Scope for MVP

### In Scope
- Email/password auth with session persistence
- Editable public/private profile
- Avatar + image gallery upload
- User discovery with filters
- Interest/like action and mutual match creation
- 1:1 private messaging for mutual matches
- Public/private posts with image support
- Report/block flow
- Basic admin/moderation visibility in database
- Responsive mobile-first web app

### Out of Scope for MVP
- Native mobile apps
- Video calls/live streaming
- Payments/subscriptions
- Complex recommendation ranking
- Group chats
- Advanced analytics dashboards

---

## Constraints and Non-Negotiables

1. Supabase remains the source of truth.
2. RLS must protect every user-owned table before launch.
3. No service-role keys in frontend code.
4. Adult-oriented product requires explicit privacy, consent, block/report, and age-gating flows before public launch.
5. Every feature should be verifiable with manual QA and at least minimal automated checks.

---

## Current State Snapshot

Observed in repository:
- Existing SvelteKit app with `src/routes/+page.svelte`
- Broken login route file name (`src/routes/login/page.svelte` should be `+page.svelte`)
- Supabase client/env naming mismatches
- TypeScript/Svelte compile errors
- Initial database design is much broader than implemented frontend
- No visible automated tests yet

This means the first milestone is **stabilization**, not feature expansion.

---

## Milestone 0 — Stabilize the Existing App

### Task 0.1: Fix route conventions
**Objective:** Make the app compile under valid SvelteKit routing.

**Files:**
- Rename: `src/routes/login/page.svelte` -> `src/routes/login/+page.svelte`
- Review: `src/routes/+layout.ts`

**Verification:**
- Run: `npm run check`
- Expected: route naming error gone

### Task 0.2: Repair login page markup and state flow
**Objective:** Make login/register screen render and switch modes correctly.

**Files:**
- Modify: `src/routes/login/+page.svelte`

**Verification:**
- Run: `npm run check`
- Start app: `npm run dev`
- Manual: open `/login`, toggle between login/register, submit empty form and see validation

### Task 0.3: Normalize Supabase client setup
**Objective:** Use one clear client implementation with correct Vite env variables.

**Files:**
- Modify: `src/lib/supabase/client.ts`
- Review/adjust: `src/lib/supabase.ts`
- Review: `.env`

**Requirements:**
- Use `import.meta.env.VITE_SUPABASE_URL`
- Use `import.meta.env.VITE_SUPABASE_ANON_KEY`
- Remove duplicate `supabase` declarations
- Export one client pattern only

**Verification:**
- Run: `npm run check`
- Manual: app can request session without runtime env errors

### Task 0.4: Fix broken auth store imports/types
**Objective:** Restore consistent auth/session state handling.

**Files:**
- Modify: `src/lib/stores/auth.ts`
- Modify: `src/lib/index.ts`
- Review: `src/routes/+layout.ts`

**Verification:**
- Run: `npm run check`
- Manual: refresh browser while logged in, session remains available

### Task 0.5: Add missing base dependencies and scripts
**Objective:** Reach green local checks.

**Files:**
- Modify: `package.json`
- Possibly modify: `tsconfig.json`

**Requirements:**
- Add missing dev deps like `@types/node` if needed
- Add `lint`/`test` placeholders if absent

**Verification:**
- Run: `npm install`
- Run: `npm run check`
- Expected: success

---

## Milestone 1 — Ship a Thin but Real Auth + Feed MVP

### Task 1.1: Validate schema bootstrap in Supabase
**Objective:** Confirm required tables/triggers/policies exist and match code assumptions.

**Files:**
- Review: `database/schema.sql`
- Review: `database/README.md`
- Add docs if needed: `docs/backend/schema-notes.md`

**Verification:**
- Confirm tables: `profiles`, `posts`, `likes`, `comments`, `matches`, `conversations`, `messages`, `reports`
- Confirm trigger for profile creation on signup

### Task 1.2: Implement signup/login/logout happy path
**Objective:** Support real user authentication against Supabase.

**Files:**
- Modify: `src/routes/login/+page.svelte`
- Modify: `src/routes/+layout.ts`
- Modify/create: auth helper files under `src/lib/`

**Verification:**
- Register user
- Confirm email flow behavior
- Log in
- Refresh page
- Log out

### Task 1.3: Guard routes based on session
**Objective:** Redirect anonymous users away from authenticated pages.

**Files:**
- Modify: `src/routes/+page.svelte`
- Optionally create hooks/layout helpers

**Verification:**
- Anonymous visit to `/` redirects to `/login`
- Authenticated visit shows feed composer

### Task 1.4: Make post creation and feed reliable
**Objective:** Users can create and read public posts.

**Files:**
- Modify: `src/routes/+page.svelte`
- Add types/helpers as needed under `src/lib/types/`

**Verification:**
- Create post
- Reload page
- Post persists
- Feed sorts by newest first

### Task 1.5: Add empty/error/loading states
**Objective:** Remove MVP rough edges and clarify failures.

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/login/+page.svelte`

**Verification:**
- Network failure shows friendly message
- Empty feed renders correctly
- Disabled buttons prevent duplicate submit

---

## Milestone 2 — Profiles and Identity

### Task 2.1: Create profile onboarding flow
**Objective:** After first login, require completion of core profile data.

**Files:**
- Create: `src/routes/onboarding/+page.svelte`
- Modify: auth/session routing logic

**MVP fields:**
- username
- display_name
- bio
- location
- interests
- relationship intent / preferences (non-sensitive version first)
- consent acknowledgement

**Verification:**
- New user is redirected to onboarding until profile is complete

### Task 2.2: Build editable profile page
**Objective:** Users can view/edit their own profile.

**Files:**
- Create: `src/routes/profile/+page.svelte`
- Create/edit supporting profile components in `src/lib/components/`

**Verification:**
- Edit profile
- Reload page
- Data persists

### Task 2.3: Add avatar and gallery uploads
**Objective:** Support image-based identity and discovery.

**Files:**
- Create: upload helpers under `src/lib/supabase/`
- Modify/create UI in profile pages

**Backend:**
- Configure Supabase Storage buckets and policies

**Verification:**
- Upload avatar
- Upload gallery image
- Confirm only owner can modify assets

---

## Milestone 3 — Discovery, Interest, and Matching

### Task 3.1: Build discovery feed of profiles
**Objective:** Show browsable profiles with minimal filters.

**Files:**
- Create: `src/routes/discover/+page.svelte`
- Create: `src/lib/components/profile-card.svelte`

**MVP filters:**
- city/location
- age range if supported legally/compliantly
- interests/tags
- online recently

**Verification:**
- Browse profiles
- Filters reduce results correctly

### Task 3.2: Implement like/pass/block actions
**Objective:** Capture interest and protect users.

**Files:**
- Modify/create discovery actions and Supabase helpers

**Verification:**
- Like creates `matches` row
- Block hides target from discovery/feed where required

### Task 3.3: Detect and surface mutual matches
**Objective:** Mutual interest unlocks chat.

**Files:**
- Create: `src/routes/matches/+page.svelte`
- Review trigger logic in database

**Verification:**
- Two test users like each other
- Mutual match appears in matches UI
- Conversation bootstrap exists or is created

---

## Milestone 4 — Private Messaging

### Task 4.1: Build conversations list
**Objective:** Users can see existing mutual-match chats.

**Files:**
- Create: `src/routes/messages/+page.svelte`
- Create: conversation list component(s)

**Verification:**
- Matched users see conversation entry
- Blocked/non-matched users do not

### Task 4.2: Build 1:1 chat screen
**Objective:** Send and receive messages.

**Files:**
- Create: `src/routes/messages/[id]/+page.svelte`
- Add Supabase realtime subscription helpers

**Verification:**
- User A sends message
- User B receives it without refresh or after refresh fallback

### Task 4.3: Add unread/read behavior
**Objective:** Make messaging usable.

**Files:**
- Modify conversation/message queries and UI

**Verification:**
- New messages increase unread count
- Opening conversation clears unread state

---

## Milestone 5 — Rich Posts and Engagement

### Task 5.1: Add post image uploads
**Objective:** Posts can include one or more images.

**Files:**
- Modify: `src/routes/+page.svelte`
- Add upload helpers/components

**Verification:**
- Create post with image
- Image renders in feed

### Task 5.2: Add comments
**Objective:** Support interaction on posts.

**Files:**
- Create post comment UI/components
- Add helpers for comments CRUD

**Verification:**
- Create/delete own comment
- Counts update correctly

### Task 5.3: Add reactions/likes
**Objective:** Basic engagement loop.

**Files:**
- Modify feed/post card components

**Verification:**
- Like/unlike toggles
- Count updates correctly

---

## Milestone 6 — Safety, Consent, Moderation

### Task 6.1: Add report flow
**Objective:** Users can report abusive/inappropriate content.

**Files:**
- Create reusable report modal/component
- Integrate with posts/profiles/messages where applicable

**Verification:**
- Report creates `reports` row with correct target metadata

### Task 6.2: Add user block flow everywhere
**Objective:** Blocking must affect discovery, feed, and messaging.

**Files:**
- Modify query helpers and UI actions across discovery/feed/messages

**Verification:**
- Blocked user disappears from discovery
- Messaging access is revoked or hidden per policy

### Task 6.3: Add age gate / consent / privacy notices
**Objective:** Reduce launch risk for an adult-oriented platform.

**Files:**
- Create: legal/info pages under `src/routes/`
- Add acceptance tracking if needed

**Verification:**
- New users must acknowledge terms before full use

---

## Milestone 7 — QA, Observability, and Launch Readiness

### Task 7.1: Add smoke test coverage
**Objective:** Catch regressions on auth/feed/profile/discovery.

**Files:**
- Create tests under `tests/` or project-standard location

**Minimum coverage:**
- login page render
- route guard behavior
- create post flow (integration where possible)
- discovery match action state

### Task 7.2: Create manual QA checklist
**Objective:** Make release verification repeatable.

**Files:**
- Create: `docs/qa/manual-smoke-checklist.md`

### Task 7.3: Production env hardening
**Objective:** Prepare deployment safely.

**Files:**
- Review `.env.example`
- Add deployment notes in `README.md` or `docs/deploy.md`

**Checklist:**
- correct public env vars only
- storage buckets configured
- auth redirect URLs configured
- email templates configured
- RLS tested
- backups enabled

---

## Recommended Agent-Based Execution Strategy

Use 3 agent roles repeatedly, but never let multiple implementers modify the same files at once.

### Agent A — Frontend/Product
Handles:
- SvelteKit pages/components
- Tailwind polish
- forms, loaders, empty states
- responsive UX

### Agent B — Backend/Supabase/Security
Handles:
- schema review
- RLS and policy validation
- storage policies
- query helpers
- auth/session correctness

### Agent C — QA/Release
Handles:
- `npm run check`
- smoke tests
- manual QA checklist
- deployment notes
- regression verification

### Execution Pattern
For each task:
1. Implementer agent changes code
2. Spec-review agent checks exact requirement fit
3. Quality-review agent checks security/maintainability
4. Controller marks task complete

This matches the `subagent-driven-development` skill.

---

## Recommended Delivery Order (Fastest Path to Usable MVP)

1. Milestone 0 — Stabilize app
2. Milestone 1 — Auth + feed
3. Milestone 2 — Profiles
4. Milestone 3 — Discovery + matching
5. Milestone 4 — Messaging
6. Milestone 6 — Safety/moderation basics
7. Milestone 5 — Rich engagement
8. Milestone 7 — QA + launch hardening

Reason: a social app becomes valuable sooner with auth/profile/discovery/chat than with polished post engagement.

---

## Definition of MVP Done

Atrevidos MVP is "done" when all of the following are true:
- New user can register and log in
- User completes profile with avatar and bio
- User can browse profiles and filter them
- User can express interest and create a mutual match
- Mutual matches can exchange private messages
- User can post text/image content
- User can block and report another user
- Core tables are protected by verified RLS
- App works on mobile browser
- Smoke checks and manual QA pass

---

## Immediate Next Step

Start with **Milestone 0 / Task 0.1–0.5** and do not add new product features until local checks are green.
