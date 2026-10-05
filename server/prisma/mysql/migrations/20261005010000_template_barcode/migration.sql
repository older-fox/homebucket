-- AlterTable
ALTER TABLE `Template` ADD COLUMN `barcode` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Template_familyId_barcode_key` ON `Template`(`familyId`, `barcode`);

