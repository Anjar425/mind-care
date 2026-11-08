-- CreateEnum
CREATE TYPE "RuleConflictStatus" AS ENUM ('OPEN', 'SUPERSEDED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RuleProposalStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'STALE');

-- CreateEnum
CREATE TYPE "RuleResolutionKind" AS ENUM ('REVISE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "RuleConsent" AS ENUM ('APPROVE', 'REJECT');

-- AlterTable
ALTER TABLE "RuleAudit" ADD COLUMN     "resolutionProposalId" TEXT;

-- CreateTable
CREATE TABLE "RuleConflictAssessment" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "comparisonVersion" TEXT NOT NULL,
    "sourceManifest" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleConflictAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConflictCase" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "caseKey" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "comparisonVersion" TEXT NOT NULL,
    "normalized" JSONB NOT NULL,
    "category" "CATEGORY" NOT NULL,
    "status" "RuleConflictStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "RuleConflictCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConflictMember" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "revisionId" TEXT NOT NULL,
    "authorExpertId" TEXT NOT NULL,
    "severity" "SEVERITY" NOT NULL,

    CONSTRAINT "RuleConflictMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleResolutionProposal" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "proposerUserId" TEXT NOT NULL,
    "planDigest" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RuleProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "RuleResolutionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleResolutionAction" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "revisionId" TEXT NOT NULL,
    "authorExpertId" TEXT NOT NULL,
    "type" "RuleResolutionKind" NOT NULL,
    "content" JSONB,

    CONSTRAINT "RuleResolutionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleResolutionParticipant" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT,
    "membershipJoinedAt" TIMESTAMP(3),

    CONSTRAINT "RuleResolutionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleResolutionDecision" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "planDigest" TEXT NOT NULL,
    "value" "RuleConsent" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleResolutionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConflictNotification" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "proposalId" TEXT,
    "recipientUserId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "RuleConflictNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConflictAudit" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "caseId" TEXT,
    "proposalId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleConflictAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuleConflictAssessment_groupId_sourceHash_comparisonVersion_key" ON "RuleConflictAssessment"("groupId", "sourceHash", "comparisonVersion");

-- CreateIndex
CREATE INDEX "RuleConflictCase_groupId_status_createdAt_idx" ON "RuleConflictCase"("groupId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RuleConflictCase_groupId_caseKey_sourceHash_key" ON "RuleConflictCase"("groupId", "caseKey", "sourceHash");

-- CreateIndex
CREATE UNIQUE INDEX "RuleConflictMember_caseId_ruleId_key" ON "RuleConflictMember"("caseId", "ruleId");

-- CreateIndex
CREATE INDEX "RuleResolutionProposal_caseId_status_idx" ON "RuleResolutionProposal"("caseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RuleResolutionAction_proposalId_ruleId_key" ON "RuleResolutionAction"("proposalId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleResolutionAction_proposalId_position_key" ON "RuleResolutionAction"("proposalId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RuleResolutionParticipant_proposalId_expertId_key" ON "RuleResolutionParticipant"("proposalId", "expertId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleResolutionDecision_participantId_key" ON "RuleResolutionDecision"("participantId");

-- CreateIndex
CREATE INDEX "RuleConflictNotification_recipientUserId_createdAt_idx" ON "RuleConflictNotification"("recipientUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RuleConflictNotification_eventKey_recipientUserId_key" ON "RuleConflictNotification"("eventKey", "recipientUserId");

-- CreateIndex
CREATE INDEX "RuleConflictAudit_caseId_createdAt_idx" ON "RuleConflictAudit"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "RuleAudit" ADD CONSTRAINT "RuleAudit_resolutionProposalId_fkey" FOREIGN KEY ("resolutionProposalId") REFERENCES "RuleResolutionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictAssessment" ADD CONSTRAINT "RuleConflictAssessment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictCase" ADD CONSTRAINT "RuleConflictCase_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictCase" ADD CONSTRAINT "RuleConflictCase_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "RuleConflictAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictMember" ADD CONSTRAINT "RuleConflictMember_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RuleConflictCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictMember" ADD CONSTRAINT "RuleConflictMember_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictMember" ADD CONSTRAINT "RuleConflictMember_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "RuleRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictMember" ADD CONSTRAINT "RuleConflictMember_authorExpertId_fkey" FOREIGN KEY ("authorExpertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionProposal" ADD CONSTRAINT "RuleResolutionProposal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RuleConflictCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionProposal" ADD CONSTRAINT "RuleResolutionProposal_proposerUserId_fkey" FOREIGN KEY ("proposerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionAction" ADD CONSTRAINT "RuleResolutionAction_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RuleResolutionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionAction" ADD CONSTRAINT "RuleResolutionAction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionAction" ADD CONSTRAINT "RuleResolutionAction_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "RuleRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionAction" ADD CONSTRAINT "RuleResolutionAction_authorExpertId_fkey" FOREIGN KEY ("authorExpertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionParticipant" ADD CONSTRAINT "RuleResolutionParticipant_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RuleResolutionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionParticipant" ADD CONSTRAINT "RuleResolutionParticipant_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionParticipant" ADD CONSTRAINT "RuleResolutionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionParticipant" ADD CONSTRAINT "RuleResolutionParticipant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionDecision" ADD CONSTRAINT "RuleResolutionDecision_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "RuleResolutionParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleResolutionDecision" ADD CONSTRAINT "RuleResolutionDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictNotification" ADD CONSTRAINT "RuleConflictNotification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RuleConflictCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictNotification" ADD CONSTRAINT "RuleConflictNotification_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RuleResolutionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictNotification" ADD CONSTRAINT "RuleConflictNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictAudit" ADD CONSTRAINT "RuleConflictAudit_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictAudit" ADD CONSTRAINT "RuleConflictAudit_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RuleConflictCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictAudit" ADD CONSTRAINT "RuleConflictAudit_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RuleResolutionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflictAudit" ADD CONSTRAINT "RuleConflictAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
