-- Not derivable from schema.prisma (Prisma doesn't model RLS) — hand-authored.
--
-- Every Supabase project auto-provisions a public PostgREST API gated by
-- an anon/publishable key, regardless of whether the app uses it. This
-- app never does (Prisma connects server-side only, via a direct
-- Postgres connection string, never exposed to the browser), but the API
-- endpoint exists anyway — without RLS, anyone holding the anon key could
-- read or write these tables directly, bypassing the app's own auth
-- entirely. No policies are added: the app's own connection uses a role
-- that bypasses RLS, so this only closes the anon-key REST path, which
-- isn't otherwise in use.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LessonCompletion" ENABLE ROW LEVEL SECURITY;
