-- AlterTable
ALTER TABLE `Item` ADD COLUMN `barcode` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Item_familyId_barcode_key` ON `Item`(`familyId`, `barcode`);

