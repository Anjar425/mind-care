-- Phase 3A: state shared by every API instance.

-- Rate-limit counters. UNLOGGED: no WAL, contents are dropped after a crash (counters reset).
CREATE UNLOGGED TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "windowEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3),
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_windowEndsAt_idx" ON "RateLimitBucket"("windowEndsAt");

-- One atomic hit: fixed window of p_window_ms; more than p_limit hits blocks the key for
-- p_block_ms. Mirrors @nestjs/throttler's ThrottlerStorage.increment() contract (seconds).
CREATE FUNCTION rate_limit_hit(p_key TEXT, p_window_ms INTEGER, p_limit INTEGER, p_block_ms INTEGER)
RETURNS TABLE (total_hits INTEGER, time_to_expire INTEGER, is_blocked BOOLEAN, time_to_block_expire INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    now_ts TIMESTAMPTZ := clock_timestamp();
    window_length INTERVAL := p_window_ms * INTERVAL '1 millisecond';
    bucket "RateLimitBucket"%ROWTYPE;
BEGIN
    INSERT INTO "RateLimitBucket" ("key", "hits", "windowEndsAt", "blockedUntil")
    VALUES (p_key, 0, now_ts + window_length, NULL)
    ON CONFLICT ("key") DO NOTHING;
    SELECT * INTO bucket FROM "RateLimitBucket" WHERE "key" = p_key FOR UPDATE;

    IF bucket."blockedUntil" IS NOT NULL AND bucket."blockedUntil" <= now_ts THEN
        bucket."blockedUntil" := NULL;
        bucket."hits" := 0;
        bucket."windowEndsAt" := now_ts + window_length;
    ELSIF bucket."blockedUntil" IS NULL AND bucket."windowEndsAt" <= now_ts THEN
        bucket."hits" := 0;
        bucket."windowEndsAt" := now_ts + window_length;
    END IF;

    IF bucket."blockedUntil" IS NULL THEN
        bucket."hits" := bucket."hits" + 1;
        IF bucket."hits" > p_limit THEN
            bucket."blockedUntil" := now_ts + p_block_ms * INTERVAL '1 millisecond';
        END IF;
    END IF;

    UPDATE "RateLimitBucket"
    SET "hits" = bucket."hits",
        "windowEndsAt" = bucket."windowEndsAt",
        "blockedUntil" = bucket."blockedUntil"
    WHERE "key" = p_key;

    RETURN QUERY SELECT
        bucket."hits",
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM bucket."windowEndsAt" - now_ts)))::INTEGER,
        bucket."blockedUntil" IS NOT NULL,
        COALESCE(GREATEST(0, CEIL(EXTRACT(EPOCH FROM bucket."blockedUntil" - now_ts))), 0)::INTEGER;
END;
$$;

-- Single-runner lease for scheduled work.
CREATE TABLE "JobLease" (
    "name" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "leaseUntil" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("name")
);
