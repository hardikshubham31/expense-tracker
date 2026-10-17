-- Sessions now store a SHA-256 hash of the cookie token instead of the token.
-- Existing (Better Auth) sessions can't be converted, so everyone signs in again.
DELETE FROM "session";
ALTER TABLE "session" RENAME COLUMN "token" TO "tokenHash";
ALTER INDEX "session_token_key" RENAME TO "session_tokenHash_key";

-- Better Auth's pending tokens (reset links, verification) are no longer valid either.
DELETE FROM "verification";
