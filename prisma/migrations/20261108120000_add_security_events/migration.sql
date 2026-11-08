-- Phase 3B: append-only security event audit (retention enforced by the maintenance job).
-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGIN_RATE_LIMITED', 'REFRESH_REUSE_DETECTED', 'SESSION_REVOKED', 'SESSIONS_REVOKED_ALL', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'EMAIL_VERIFIED', 'CREDENTIAL_REVIEWED');
-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "type" "SecurityEventType" NOT NULL,
    "actorUserId" TEXT,
    "subjectUserId" TEXT,
    "ipHash" TEXT,
    "userAgentFamily" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
-- CreateIndex
CREATE INDEX "SecurityEvent_subjectUserId_createdAt_idx" ON "SecurityEvent"("subjectUserId", "createdAt");
-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");
