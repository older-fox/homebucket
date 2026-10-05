-- CreateTable
CREATE TABLE "Family" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Family_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FamilyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilyInvite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyInvite_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FamilyInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageId" INTEGER,
    "sortIndex" REAL NOT NULL DEFAULT 0,
    "qrToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Location_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL NOT NULL DEFAULT 0,
    "model" TEXT,
    "manufacturer" TEXT,
    "locationId" INTEGER,
    "templateId" INTEGER,
    "coverImageId" INTEGER,
    "qrToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Item_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Item_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Item_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemUnit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "sn" TEXT,
    "locationId" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItemUnit_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemUnit_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemUnit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#14b8a6',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageId" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL NOT NULL DEFAULT 0,
    "model" TEXT,
    "manufacturer" TEXT,
    "defaultLocationId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Template_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Template_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Template_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "familyId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationChannel_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ItemImages" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ItemImages_A_fkey" FOREIGN KEY ("A") REFERENCES "Attachment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ItemImages_B_fkey" FOREIGN KEY ("B") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ItemTags" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ItemTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ItemTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_TemplateTags" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_TemplateTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TemplateTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "defaultFamilyId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_defaultFamilyId_fkey" FOREIGN KEY ("defaultFamilyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "passwordHash", "updatedAt", "username") SELECT "createdAt", "email", "id", "passwordHash", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyMember_familyId_userId_key" ON "FamilyMember"("familyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyInvite_token_key" ON "FamilyInvite"("token");

-- CreateIndex
CREATE INDEX "FamilyInvite_familyId_idx" ON "FamilyInvite"("familyId");

-- CreateIndex
CREATE INDEX "Attachment_familyId_idx" ON "Attachment"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_qrToken_key" ON "Location"("qrToken");

-- CreateIndex
CREATE INDEX "Location_familyId_parentId_sortIndex_idx" ON "Location"("familyId", "parentId", "sortIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Item_qrToken_key" ON "Item"("qrToken");

-- CreateIndex
CREATE INDEX "Item_familyId_createdAt_idx" ON "Item"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "Item_familyId_locationId_idx" ON "Item"("familyId", "locationId");

-- CreateIndex
CREATE INDEX "Item_familyId_name_idx" ON "Item"("familyId", "name");

-- CreateIndex
CREATE INDEX "ItemUnit_familyId_itemId_idx" ON "ItemUnit"("familyId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemUnit_familyId_sn_key" ON "ItemUnit"("familyId", "sn");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_familyId_name_key" ON "Tag"("familyId", "name");

-- CreateIndex
CREATE INDEX "Template_familyId_name_idx" ON "Template"("familyId", "name");

-- CreateIndex
CREATE INDEX "NotificationChannel_familyId_idx" ON "NotificationChannel"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemImages_AB_unique" ON "_ItemImages"("A", "B");

-- CreateIndex
CREATE INDEX "_ItemImages_B_index" ON "_ItemImages"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemTags_AB_unique" ON "_ItemTags"("A", "B");

-- CreateIndex
CREATE INDEX "_ItemTags_B_index" ON "_ItemTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TemplateTags_AB_unique" ON "_TemplateTags"("A", "B");

-- CreateIndex
CREATE INDEX "_TemplateTags_B_index" ON "_TemplateTags"("B");

