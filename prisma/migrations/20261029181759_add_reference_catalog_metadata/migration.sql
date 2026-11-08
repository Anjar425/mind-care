/*
  Warnings:

  - A unique constraint covering the columns `[category,severty]` on the table `Conclusion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[number]` on the table `DASS21` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[number]` on the table `DASS42` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `catalogVersion` to the `DASS21` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category` to the `DASS21` table without a default value. This is not possible if the table is not empty.
  - Added the required column `number` to the `DASS21` table without a default value. This is not possible if the table is not empty.
  - Added the required column `catalogVersion` to the `DASS42` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category` to the `DASS42` table without a default value. This is not possible if the table is not empty.
  - Added the required column `number` to the `DASS42` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DASS21" ADD COLUMN     "catalogVersion" TEXT NOT NULL,
ADD COLUMN     "category" "CATEGORY" NOT NULL,
ADD COLUMN     "number" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "DASS42" ADD COLUMN     "catalogVersion" TEXT NOT NULL,
ADD COLUMN     "category" "CATEGORY" NOT NULL,
ADD COLUMN     "number" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Conclusion_category_severty_key" ON "Conclusion"("category", "severty");

-- CreateIndex
CREATE UNIQUE INDEX "DASS21_number_key" ON "DASS21"("number");

-- CreateIndex
CREATE UNIQUE INDEX "DASS42_number_key" ON "DASS42"("number");
