/*
  Warnings:

  - You are about to drop the column `yearExperience` on the `Expert` table. All the data in the column will be lost.
  - You are about to drop the column `experienceWeight` on the `Weight` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Expert" DROP COLUMN "yearExperience",
ADD COLUMN     "clinicalHours" INTEGER,
ADD COLUMN     "profileValidatedAt" TIMESTAMP(3),
ADD COLUMN     "profileVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Weight" DROP COLUMN "experienceWeight",
ADD COLUMN     "clinicalHoursWeight" INTEGER;
