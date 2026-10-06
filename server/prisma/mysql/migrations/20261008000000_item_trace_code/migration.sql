-- AlterTable
ALTER TABLE `Item` ADD COLUMN `traceCode` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Item_familyId_traceCode_key` ON `Item`(`familyId`, `traceCode`);

