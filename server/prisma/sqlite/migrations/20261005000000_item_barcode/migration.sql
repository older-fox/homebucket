-- AlterTable
ALTER TABLE "Item" ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Item_familyId_barcode_key" ON "Item"("familyId", "barcode");

