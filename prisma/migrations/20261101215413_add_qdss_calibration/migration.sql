-- CreateEnum
CREATE TYPE "QdssRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'STALE');

-- CreateTable
CREATE TABLE "QdssConfiguration" (
    "id" TEXT NOT NULL,
    "groupId" INTEGER,
    "datasetId" TEXT,
    "activeRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QdssConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdssDataset" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "samples" JSONB NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QdssDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdssReference" (
    "id" TEXT NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QdssReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdssRun" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "referenceId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "QdssRunStatus" NOT NULL DEFAULT 'RUNNING',
    "weights" JSONB,
    "consensus" JSONB,
    "outputHash" TEXT,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QdssRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QdssAudit" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QdssAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QdssConfiguration_groupId_key" ON "QdssConfiguration"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "QdssConfiguration_activeRunId_key" ON "QdssConfiguration"("activeRunId");

-- CreateIndex
CREATE UNIQUE INDEX "QdssDataset_configurationId_version_key" ON "QdssDataset"("configurationId", "version");

-- CreateIndex
CREATE INDEX "QdssRun_configurationId_createdAt_idx" ON "QdssRun"("configurationId", "createdAt");

-- CreateIndex
CREATE INDEX "QdssAudit_configurationId_createdAt_idx" ON "QdssAudit"("configurationId", "createdAt");

-- AddForeignKey
ALTER TABLE "QdssConfiguration" ADD CONSTRAINT "QdssConfiguration_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssConfiguration" ADD CONSTRAINT "QdssConfiguration_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "QdssDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssConfiguration" ADD CONSTRAINT "QdssConfiguration_activeRunId_fkey" FOREIGN KEY ("activeRunId") REFERENCES "QdssRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssDataset" ADD CONSTRAINT "QdssDataset_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "QdssConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssDataset" ADD CONSTRAINT "QdssDataset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssRun" ADD CONSTRAINT "QdssRun_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "QdssConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssRun" ADD CONSTRAINT "QdssRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "QdssDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssRun" ADD CONSTRAINT "QdssRun_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "QdssReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssRun" ADD CONSTRAINT "QdssRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssAudit" ADD CONSTRAINT "QdssAudit_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "QdssConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QdssAudit" ADD CONSTRAINT "QdssAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
