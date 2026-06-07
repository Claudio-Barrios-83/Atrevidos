# Schema notes for MVP

Static validation against `database/schema.sql`, `database/README.md`, `docs/plans/2026-06-04-atrevidos-mvp-plan.md`, and current frontend code. These notes are repo-grounded only; they do not claim anything about a live Supabase project state.

## Confirmed present
- Tables exist in schema: `profiles`, `posts`, `likes`, `comments`, `matches`, `conversations`, `conversation_participants`, `messages`, `reports`, `report_history`.
- Signup profile trigger exists: `on_auth_user_created` → `handle_new_user()`.
- RLS is enabled on: `profiles`, `posts`, `likes`, `comments`, `matches`, `conversations`, `conversation_participants`, `messages`, `reports`.
- Utility views/functions exist: `public_feed`, `user_conversations`, `suggest_connections`, `search_users`.

> Presence is not the same as verified end-to-end behavior. In particular, the signup trigger exists in-repo, but its compatibility with the active RLS/privilege model is not proven by these notes alone.

## MVP strengths
- Core auth/profile/feed/match/chat/report tables are already modeled.
- `matches` can mark mutual interest and auto-create a 1:1 conversation.
- Post like/comment counters are maintained by triggers.
- Username validation and auto-profile creation are already in schema.

## Launch-blocking / bootstrap-critical issues

### 1) `suggest_connections()` has unresolved in-repo dependencies and should be treated as unusable until fixed
`database/schema.sql` calls `array_intersect(...)` inside `suggest_connections()`, but there is no definition for `array_intersect` anywhere else in the repo.

**Impact:** discovery logic in this function is not self-contained in the repository and should not be treated as ready for direct MVP use.

**Implementation assumption:** discovery work should not depend on `suggest_connections()` until the helper is defined in-repo or the function is rewritten.

### 2) Message activity trigger does not match the `messages` table shape
`update_last_active()` updates profiles with `WHERE id = NEW.user_id`, but `messages` uses `sender_id`, not `user_id`. The trigger `on_user_activity_messages` is attached directly to `messages`.

**Impact:** chat message inserts are not safely aligned with the trigger logic as written, so `last_active_at` updates for chat traffic are currently unreliable and may error depending on execution context.

**Implementation assumption:** upcoming chat work should not rely on message-triggered `last_active_at` updates until the trigger function is made table-aware or split per table.

### 3) Current public feed page bypasses safer schema abstractions
The current homepage loads directly from `posts` and joins `profiles`:
- `src/routes/+page.svelte` queries `posts`
- filters only `visibility = 'public'`
- joins `profiles (username, avatar_url, display_name)`

But the schema already exposes `public_feed`, which additionally filters `is_archived = false` and `is_anonymous = false`.

**Impact:** the current UI path can surface archived public posts and can deanonymize anonymous public posts by joining author profiles directly.

**Implementation assumption:** do not treat the current direct `posts` query as a reliable final feed path; switch to `public_feed` or replicate its constraints before calling feed behavior MVP-safe.

### 4) Direct-message access is now DB-gated, but conversation metadata writes are still incomplete
`schema.sql` now centralizes chat access with DB helpers:
- `has_block_between_users(...)`
- `has_active_direct_match(...)`
- `is_valid_direct_conversation(...)`
- `can_access_conversation(...)`

Current effect:
- direct 1:1 `conversations`, `conversation_participants`, and `messages` reads require an active participant,
- direct 1:1 access also requires exactly 2 active participants,
- both users must still have a mutual active like/super-like pair,
- any block in either direction removes direct-chat access,
- direct-message writes are DB-gated as well, but `conversation_participants` self-updates are intentionally limited to preserving the same membership/role/activity tuple (the live app currently uses that path for `last_read_at` only),
- group conversations keep the simpler "active participant" access model.

There are still no `UPDATE` or `DELETE` policies for `conversations` despite RLS being enabled.

**Residual impact:** direct chat access no longer depends on client-side filtering alone, but arbitrary conversation metadata updates remain intentionally constrained. `last_message_at` is still not maintained by a message trigger, so ordering based on that column can drift unless application code updates it.

## Other gaps / mismatches that matter now

### 5) Signup auto-profile creation is present but not fully verified against RLS
`handle_new_user()` inserts into `profiles`, and `on_auth_user_created` attaches it to `auth.users`. However, `handle_new_user()` is not declared `SECURITY DEFINER`, while `profiles` has RLS enabled and user-facing insert policy expectations are strict.

**Impact:** the existence of the trigger alone does not prove that a real signup flow will always create a profile successfully under the active privilege model.

**Implementation assumption:** treat auto-profile creation as unverified until exercised against a real Supabase project or adjusted to an explicitly safe privilege model.

### 6) Generated TS types are out of date
`src/lib/database.types.ts` only includes `profiles`, `posts`, `likes`, `comments`, and `matches`.
It is missing `conversations`, `conversation_participants`, `messages`, `reports`, views, functions, and enums from `schema.sql`.

**Implementation assumption:** do not trust the generated DB types for chat/report/discovery work until they are regenerated.

### 7) README overstates soft-delete behavior
`database/README.md` says:
- posts delete = soft-delete
- messages delete = soft-delete

But `schema.sql` defines `handle_soft_delete()` without attaching it to any table trigger. Current `DELETE` policies would hard-delete rows.

**Implementation assumption:** if MVP wants soft delete, use `UPDATE` (`posts.is_archived`, `comments.is_hidden`, `messages.is_deleted`) instead of `DELETE` until SQL is fixed.

### 8) Block flow is only partially modeled
There is no dedicated `blocks` table. Blocking is encoded as `matches.match_type = 'block'`.

Confirmed SQL issues:
- `posts_select_public` and `public_feed` contain `OR ... AND match_type ...` expressions without parentheses, so operator precedence can let one branch ignore the intended `match_type` restriction.
- Block exclusions are not consistently centralized across feed/discovery/chat paths.

Areas requiring follow-up validation:
- `handle_match_check()` / related match queries
- `suggest_connections()` / other match-based logic before discovery launch

**Implementation assumption:** current schema is not sufficient to trust block behavior everywhere.

### 9) `followers` visibility is not consistently implemented
`posts.visibility` supports `public | followers | private`, and the README claims contact-only access works.

But `likes` and `comments` RLS only check `public` or own post access, not matched/contact access. A user may be able to see a followers-only post but fail to read/write likes/comments on it.

**Implementation assumption:** for MVP feed, treat `public` as the reliable path until visibility/policy alignment is fixed.

### 10) Chat participant insertion is tighter, but group-management semantics are still basic
`conversation_participants` no longer accepts arbitrary inserts with `WITH CHECK (true)`.

Current policy shape:
- direct 1:1 participant creation is expected to happen through the hardened `create_conversation_for_match(...)` path,
- normal client inserts are limited to group conversations,
- self-join is allowed for the authenticated user,
- adding other group participants requires an active `admin`/`moderator` participant row,
- self-updates no longer allow role/activity changes, which closes the earlier privilege-escalation hole and leaves `last_read_at` as the intended mutable field for normal members.

**Residual impact:** this closes the previous client-side hole for arbitrary direct memberships, but group invitation/removal flows still need explicit product rules and end-to-end validation.

### 11) Moderation/admin model is weak for MVP
Admin behavior is inferred from `profiles.username = 'admin' OR is_verified = true`.
That makes `is_verified` double as a moderation permission flag.

Also:
- `report_history` exists but RLS is not enabled for it in `schema.sql`
- no clear moderator/admin role table exists

**Implementation assumption:** basic report submission is modeled, but admin/moderation UI should be treated as provisional.

### 12) Discovery/search functions need extra caution
`suggest_connections()` and `search_users()` are declared `SECURITY DEFINER`.

In addition, `suggest_connections()` has obvious in-repo problems beyond the missing `array_intersect(...)` helper:
- the function body uses ambiguous/unqualified `user_id` references such as `WHERE (user_id = user_id AND target_user_id = p.id)`
- discovery behavior should therefore be treated as unverified even before considering runtime permissions

**Impact:** access behavior is special and the implementation itself needs correction before discovery/search can be trusted.

**Implementation assumption:** do not assume these functions are equivalent to normal client-side table reads or ready for direct MVP use.

### 13) Profile/onboarding fields exist, but flow validation is still pending
Current profile schema already models explicit:
- consent acknowledgement (`consent_acknowledged`)
- age-gating / 18+ confirmation (`age_confirmed`)
- profile completion state (`onboarding_completed_at`)
- gallery/media profile fields (`gallery_urls`, `cover_url`)
- relationship intent / preferences (`relationship_intent`, `relationship_preferences`)

**Implementation assumption:** the remaining risk is not field absence but end-to-end validation of the onboarding/profile flows against the live Supabase project and RLS behavior.

## Current code alignment notes
- The app can already query `posts` joined with `profiles`, so the basic feed page is repairable without a full rewrite.
- The current direct `posts` query is not aligned with the safer `public_feed` view because it ignores `is_archived` and `is_anonymous` constraints.
- If upcoming work needs typed chat/report/discovery access, regenerate Supabase types first.

## Recommended next actions
1. Fix schema bootstrap by defining or removing the dependency on `array_intersect(...)`.
2. Move the frontend feed to `public_feed` or mirror its safety constraints (`visibility`, `is_archived`, `is_anonymous`, block exclusions).
3. Regenerate `src/lib/database.types.ts` from the actual Supabase schema.
4. Fix match/block SQL precedence and explicitly exclude blocked users from feed/discovery/chat queries.
5. Decide whether group conversation update/delete flows need explicit RLS policies beyond current participant gating.
6. Decide whether soft delete is real; if yes, implement it consistently in SQL/docs.
7. Align `followers` visibility rules across posts/likes/comments.
8. Add explicit moderation roles and adult-safety/onboarding fields before launch-critical work.
