/*
  Warnings:

  - A unique constraint covering the columns `[expertId,dass21Id]` on the table `Preferences` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `catalogVersion` to the `Preferences` table without a default value. This is not possible if the table is not empty.
  - Made the column `percentAnxiety` on table `Preferences` required. This step will fail if there are existing NULL values in that column.
  - Made the column `percentDepression` on table `Preferences` required. This step will fail if there are existing NULL values in that column.
  - Made the column `percentStress` on table `Preferences` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Preferences_dass21Id_key";

-- AlterTable
ALTER TABLE "Preferences" ADD COLUMN     "catalogVersion" TEXT NOT NULL,
ALTER COLUMN "percentAnxiety" SET NOT NULL,
ALTER COLUMN "percentDepression" SET NOT NULL,
ALTER COLUMN "percentStress" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Preferences_expertId_dass21Id_key" ON "Preferences"("expertId", "dass21Id");
