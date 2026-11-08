/*
  Warnings:

  - You are about to drop the column `inviteToken` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the column `tokenExpireAt` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the `_ExpertToGroup` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "GroupMembershipStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "GroupGrantStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GroupAction" AS ENUM ('CREATED', 'METADATA_UPDATED', 'INVITED', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED', 'INVITATION_REVOKED', 'MEMBER_LEFT', 'MEMBER_REMOVED', 'TRANSFER_PROPOSED', 'TRANSFER_ACCEPTED', 'TRANSFER_DECLINED', 'TRANSFER_REVOKED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "_ExpertToGroup" DROP CONSTRAINT "_ExpertToGroup_A_fkey";

-- DropForeignKey
ALTER TABLE "_ExpertToGroup" DROP CONSTRAINT "_ExpertToGroup_B_fkey";

-- DropIndex
DROP INDEX "Group_inviteToken_key";

-- AlterTable
ALTER TABLE "Group" DROP COLUMN "inviteToken",
DROP COLUMN "tokenExpireAt",
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "_ExpertToGroup";

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "expertId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL,
    "status" "GroupMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupInvitation" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "status" "GroupGrantStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "GroupInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupLeadershipTransfer" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "proposedByExpertId" TEXT NOT NULL,
    "targetExpertId" TEXT NOT NULL,
    "expectedStateHash" TEXT NOT NULL,
    "status" "GroupGrantStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "GroupLeadershipTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAudit" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "GroupAction" NOT NULL,
    "affectedExpertId" TEXT,
    "invitationId" TEXT,
    "transferId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupMembership_expertId_status_idx" ON "GroupMembership"("expertId", "status");

-- CreateIndex
CREATE INDEX "GroupMembership_groupId_status_idx" ON "GroupMembership"("groupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_expertId_key" ON "GroupMembership"("groupId", "expertId");

-- CreateIndex
CREATE INDEX "GroupInvitation_recipientUserId_createdAt_idx" ON "GroupInvitation"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupInvitation_groupId_status_idx" ON "GroupInvitation"("groupId", "status");

-- CreateIndex
CREATE INDEX "GroupLeadershipTransfer_targetExpertId_createdAt_idx" ON "GroupLeadershipTransfer"("targetExpertId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupLeadershipTransfer_groupId_status_idx" ON "GroupLeadershipTransfer"("groupId", "status");

-- CreateIndex
CREATE INDEX "GroupAudit_groupId_createdAt_idx" ON "GroupAudit"("groupId", "createdAt");

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupLeadershipTransfer" ADD CONSTRAINT "GroupLeadershipTransfer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupLeadershipTransfer" ADD CONSTRAINT "GroupLeadershipTransfer_proposedByExpertId_fkey" FOREIGN KEY ("proposedByExpertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupLeadershipTransfer" ADD CONSTRAINT "GroupLeadershipTransfer_targetExpertId_fkey" FOREIGN KEY ("targetExpertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAudit" ADD CONSTRAINT "GroupAudit_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAudit" ADD CONSTRAINT "GroupAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
