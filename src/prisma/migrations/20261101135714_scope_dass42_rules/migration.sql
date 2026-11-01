/*
  Warnings:

  - You are about to drop the column `conjuction` on the `Premise` table. All the data in the column will be lost.
  - You are about to drop the column `conclusionId` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the column `premiseId` on the `Rule` table. All the data in the column will be lost.
  - You are about to drop the `_ExpertToRule` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[ruleRevisionId,position]` on the table `Premise` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `joinToNext` to the `Premise` table without a default value. This is not possible if the table is not empty.
  - Added the required column `position` to the `Premise` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ruleRevisionId` to the `Premise` table without a default value. This is not possible if the table is not empty.
  - Added the required column `authorExpertId` to the `Rule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `groupId` to the `Rule` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RuleAction" AS ENUM ('CREATED', 'REVISED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_conclusionId_fkey";

-- DropForeignKey
ALTER TABLE "Rule" DROP CONSTRAINT "Rule_premiseId_fkey";

-- DropForeignKey
ALTER TABLE "_ExpertToRule" DROP CONSTRAINT "_ExpertToRule_A_fkey";

-- DropForeignKey
ALTER TABLE "_ExpertToRule" DROP CONSTRAINT "_ExpertToRule_B_fkey";

-- AlterTable
ALTER TABLE "Premise" DROP COLUMN "conjuction",
ADD COLUMN     "joinToNext" "CONJUCTION" NOT NULL,
ADD COLUMN     "position" INTEGER NOT NULL,
ADD COLUMN     "ruleRevisionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Rule" DROP COLUMN "conclusionId",
DROP COLUMN "premiseId",
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "authorExpertId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "groupId" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "_ExpertToRule";

-- CreateTable
CREATE TABLE "RuleAudit" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "revisionId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "RuleAction" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleRevision" (
    "id" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "grammarVersion" TEXT NOT NULL,
    "canonicalVersion" TEXT NOT NULL,
    "originalPayload" JSONB NOT NULL,
    "canonicalAntecedent" JSONB NOT NULL,
    "antecedentHash" TEXT NOT NULL,
    "conclusionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuleAudit_ruleId_createdAt_idx" ON "RuleAudit"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "RuleRevision_antecedentHash_idx" ON "RuleRevision"("antecedentHash");

-- CreateIndex
CREATE UNIQUE INDEX "RuleRevision_ruleId_version_key" ON "RuleRevision"("ruleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Premise_ruleRevisionId_position_key" ON "Premise"("ruleRevisionId", "position");

-- CreateIndex
CREATE INDEX "Rule_groupId_updatedAt_id_idx" ON "Rule"("groupId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Rule_authorExpertId_updatedAt_id_idx" ON "Rule"("authorExpertId", "updatedAt", "id");

-- AddForeignKey
ALTER TABLE "Premise" ADD CONSTRAINT "Premise_ruleRevisionId_fkey" FOREIGN KEY ("ruleRevisionId") REFERENCES "RuleRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleAudit" ADD CONSTRAINT "RuleAudit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleAudit" ADD CONSTRAINT "RuleAudit_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "RuleRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleAudit" ADD CONSTRAINT "RuleAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleRevision" ADD CONSTRAINT "RuleRevision_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleRevision" ADD CONSTRAINT "RuleRevision_conclusionId_fkey" FOREIGN KEY ("conclusionId") REFERENCES "Conclusion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_authorExpertId_fkey" FOREIGN KEY ("authorExpertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
