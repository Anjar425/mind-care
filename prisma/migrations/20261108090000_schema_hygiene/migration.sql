-- Phase 3A schema hygiene. Renames keep existing data (Prisma would drop and re-add).

-- Field names follow the Prisma camelCase convention used by every other model.
ALTER TABLE "User" RENAME COLUMN "email_verified_at" TO "emailVerifiedAt";
ALTER TABLE "User" RENAME COLUMN "created_at" TO "createdAt";
ALTER TABLE "Conclusion" RENAME COLUMN "severty" TO "severity";
ALTER INDEX "Conclusion_category_severty_key" RENAME TO "Conclusion_category_severity_key";

-- Legacy expert documents, superseded by CredentialRevision; no code reads or writes them.
ALTER TABLE "Document" DROP CONSTRAINT "Document_expertId_fkey";
DROP TABLE "Document";
DROP TYPE "DOCUMENT_TYPE";
-- Superseded by approved credential revisions (CredentialEligibilityService).
ALTER TABLE "Expert" DROP COLUMN "verifiedUntil";

-- Logout-all and password reset revoke sessions by user.
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");
