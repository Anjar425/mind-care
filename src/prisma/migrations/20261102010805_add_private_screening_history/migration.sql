-- CreateTable
CREATE TABLE "HistoryVault" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "envelopeVersion" INTEGER NOT NULL DEFAULT 1,
    "keyEpoch" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "storageConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentUpdatedAt" TIMESTAMP(3),
    "recoveryVersion" INTEGER NOT NULL DEFAULT 1,
    "recoveryNonce" VARCHAR(16) NOT NULL,
    "recoveryCiphertext" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoryVault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryEntry" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "keyEpoch" INTEGER NOT NULL DEFAULT 1,
    "envelopeVersion" INTEGER NOT NULL DEFAULT 1,
    "nonce" VARCHAR(16) NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HistoryVault_userId_key" ON "HistoryVault"("userId");

-- CreateIndex
CREATE INDEX "HistoryEntry_vaultId_id_idx" ON "HistoryEntry"("vaultId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HistoryEntry_vaultId_keyEpoch_nonce_key" ON "HistoryEntry"("vaultId", "keyEpoch", "nonce");

-- AddForeignKey
ALTER TABLE "HistoryVault" ADD CONSTRAINT "HistoryVault_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoryEntry" ADD CONSTRAINT "HistoryEntry_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "HistoryVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
