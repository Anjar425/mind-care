-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('STR', 'SIP');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "Expert" ADD COLUMN     "credentialSuspendedAt" TIMESTAMP(3),
ADD COLUMN     "credentialVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CredentialIdentity" (
    "id" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "lookup" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,

    CONSTRAINT "CredentialIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialRevision" (
    "id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'PENDING',
    "numberCipher" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "reason" TEXT,
    "purgeAfter" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "issuerVerification" TEXT NOT NULL DEFAULT 'NOT_CHECKED',

    CONSTRAINT "CredentialRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialAudit" (
    "id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "revisionId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialReminder" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastFailure" TEXT,

    CONSTRAINT "CredentialReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredentialIdentity_type_lookup_key" ON "CredentialIdentity"("type", "lookup");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialRevision_objectKey_key" ON "CredentialRevision"("objectKey");

-- CreateIndex
CREATE INDEX "CredentialRevision_expertId_type_status_idx" ON "CredentialRevision"("expertId", "type", "status");

-- CreateIndex
CREATE INDEX "CredentialRevision_status_expiresAt_idx" ON "CredentialRevision"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CredentialRevision_purgeAfter_purgedAt_idx" ON "CredentialRevision"("purgeAfter", "purgedAt");

-- CreateIndex
CREATE INDEX "CredentialAudit_expertId_createdAt_idx" ON "CredentialAudit"("expertId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialReminder_revisionId_key" ON "CredentialReminder"("revisionId");

-- AddForeignKey
ALTER TABLE "CredentialIdentity" ADD CONSTRAINT "CredentialIdentity_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialRevision" ADD CONSTRAINT "CredentialRevision_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialRevision" ADD CONSTRAINT "CredentialRevision_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CredentialIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialRevision" ADD CONSTRAINT "CredentialRevision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAudit" ADD CONSTRAINT "CredentialAudit_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAudit" ADD CONSTRAINT "CredentialAudit_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CredentialRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAudit" ADD CONSTRAINT "CredentialAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialReminder" ADD CONSTRAINT "CredentialReminder_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CredentialRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
