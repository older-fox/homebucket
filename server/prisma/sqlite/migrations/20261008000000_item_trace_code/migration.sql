-- AlterTable
ALTER TABLE "Item" ADD COLUMN "traceCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Item_familyId_traceCode_key" ON "Item"("familyId", "traceCode");

