-- CreateEnum
CREATE TYPE "CATEGORY" AS ENUM ('DEPRESSION', 'ANXIETY', 'STRESS');

-- CreateEnum
CREATE TYPE "SEVERITY" AS ENUM ('NORMAL', 'MILD', 'MODERATE', 'SEVERE', 'EXTREMELY_SEVERE');

-- CreateEnum
CREATE TYPE "DOCUMENT_TYPE" AS ENUM ('REGISTRATION_LICENCE', 'PRACTICE_LICENSE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "Education" AS ENUM ('BACHELOR', 'MASTER', 'DOCTOR');

-- CreateEnum
CREATE TYPE "PREFIX" AS ENUM ('NO_PREFIX', 'NOT');

-- CreateEnum
CREATE TYPE "CONJUCTION" AS ENUM ('AND', 'OR', 'THEN');

-- CreateEnum
CREATE TYPE "LEVEL" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ROLE" AS ENUM ('ADMIN', 'EXPERT', 'USER');

-- CreateTable
CREATE TABLE "Conclusion" (
    "id" SERIAL NOT NULL,
    "category" "CATEGORY" NOT NULL,
    "severty" "SEVERITY" NOT NULL,

    CONSTRAINT "Conclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DASS21" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "DASS21_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DASS42" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "DASS42_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "type" "DOCUMENT_TYPE" NOT NULL,
    "path" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expert" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "address" TEXT,
    "phone" TEXT,
    "photo" TEXT,
    "verifiedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "education" "Education",
    "publicationsNumber" INTEGER,
    "patientsNumber" INTEGER,
    "yearExperience" INTEGER,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Expert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "tokenExpireAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preferences" (
    "id" SERIAL NOT NULL,
    "percentAnxiety" INTEGER,
    "percentDepression" INTEGER,
    "percentStress" INTEGER,
    "dass21Id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,

    CONSTRAINT "Preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Premise" (
    "id" SERIAL NOT NULL,
    "prefix" "PREFIX" NOT NULL,
    "level" "LEVEL" NOT NULL,
    "conjuction" "CONJUCTION" NOT NULL,
    "dass42Id" TEXT NOT NULL,

    CONSTRAINT "Premise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" SERIAL NOT NULL,
    "premiseId" INTEGER NOT NULL,
    "conclusionId" INTEGER NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "ROLE" NOT NULL,
    "email_verified_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Weight" (
    "id" SERIAL NOT NULL,
    "educationWeight" INTEGER NOT NULL,
    "publicationWeight" INTEGER NOT NULL,
    "patientWeight" INTEGER NOT NULL,
    "experienceWeight" INTEGER NOT NULL,
    "expertId" TEXT NOT NULL,

    CONSTRAINT "Weight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ExpertToGroup" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ExpertToGroup_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ExpertToRule" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ExpertToRule_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expert_userId_key" ON "Expert"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_inviteToken_key" ON "Group"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "Preferences_dass21Id_key" ON "Preferences"("dass21Id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Weight_expertId_key" ON "Weight"("expertId");

-- CreateIndex
CREATE INDEX "_ExpertToGroup_B_index" ON "_ExpertToGroup"("B");

-- CreateIndex
CREATE INDEX "_ExpertToRule_B_index" ON "_ExpertToRule"("B");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expert" ADD CONSTRAINT "Expert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preferences" ADD CONSTRAINT "Preferences_dass21Id_fkey" FOREIGN KEY ("dass21Id") REFERENCES "DASS21"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preferences" ADD CONSTRAINT "Preferences_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Premise" ADD CONSTRAINT "Premise_dass42Id_fkey" FOREIGN KEY ("dass42Id") REFERENCES "DASS42"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_premiseId_fkey" FOREIGN KEY ("premiseId") REFERENCES "Premise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_conclusionId_fkey" FOREIGN KEY ("conclusionId") REFERENCES "Conclusion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Weight" ADD CONSTRAINT "Weight_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "Expert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExpertToGroup" ADD CONSTRAINT "_ExpertToGroup_A_fkey" FOREIGN KEY ("A") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExpertToGroup" ADD CONSTRAINT "_ExpertToGroup_B_fkey" FOREIGN KEY ("B") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExpertToRule" ADD CONSTRAINT "_ExpertToRule_A_fkey" FOREIGN KEY ("A") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExpertToRule" ADD CONSTRAINT "_ExpertToRule_B_fkey" FOREIGN KEY ("B") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
