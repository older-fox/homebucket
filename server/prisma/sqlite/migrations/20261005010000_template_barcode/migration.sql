-- AlterTable
ALTER TABLE "Template" ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Template_familyId_barcode_key" ON "Template"("familyId", "barcode");

