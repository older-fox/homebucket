import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 初始建表（SQLite）。
 *
 * 时间戳/类名与 mysql/1791302382566-Init.ts 保持一致：两方言的 Init 是同一份 DDL 的两种写法，
 * 以前 sqlite 侧叫 Init1791302623501（比 mysql 晚 241 秒），跨方言核对迁移状态时对不上号。
 * 已应用过的库不受影响：数据库里记的是执行过的 name，改名不会重跑；重命名前留下的陈旧记录
 * （Init1791302623501）由 up() 顺手删掉，否则它会在回滚时卡住（见 up() 里的说明）。
 *
 * 与 mysql 侧一样加了整迁移守卫：已有库（Prisma 时代建的表）直接跳过，对齐交给
 * NormalizeFromPrisma 与后续增量迁移，这样 `npm run db:run` 在已有库上也是安全的。
 *
 * 末尾补的 13 条外键索引是为 SQLite 准备的：MySQL 的 InnoDB 会为每个外键自动建索引，
 * SQLite 不会，于是按外键列（含 ON DELETE CASCADE）查询会退化成全表扫描。
 * 这些索引在实体上以 @Index(..., { synchronize: false }) 声明，TypeORM 既不建也不删它们
 * （见 entities/foreign-key-index.ts），因此 schema:log 仍然零漂移。
 */
export class Init1791302382566 implements MigrationInterface {
    name = 'Init1791302382566'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 删掉改名前的陈旧登记。老库的 migrations 表里存的是旧名字 Init1791302623501，改名后
        // 它已经不在迁移列表里；TypeORM 按 migrations.id 倒序回滚，最后一定会轮到这条记录，
        // 却找不到对应的类，于是回滚永远收不了尾（表都删完了，记录还留着）。
        if (await queryRunner.hasTable('migrations')) {
            await queryRunner.query(`DELETE FROM "migrations" WHERE "name" = 'Init1791302623501'`);
        }
        // 已有库（Prisma 时代建的表，或已经跑过本项目 Init 的库）直接整体跳过：
        // 表结构的对齐交给 NormalizeFromPrisma 与后续增量迁移去做。
        if (await queryRunner.hasTable('User')) return;

        await queryRunner.query(`CREATE TABLE "FamilyMember" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar(191) NOT NULL DEFAULT ('member'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_aee436d2ac963dff186c42d759b" UNIQUE ("familyId", "userId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1b3c9e23d4f499a9fe4501289f" ON "FamilyMember" ("userId") `);
        await queryRunner.query(`CREATE TABLE "FamilyInvite" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "token" varchar(191) NOT NULL, "createdById" integer NOT NULL, "expiresAt" datetime(3), "revokedAt" datetime(3), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_7da099066a06fffee6db8185c9d" UNIQUE ("token"))`);
        await queryRunner.query(`CREATE INDEX "IDX_519dec9542647a659360ff2f2c" ON "FamilyInvite" ("familyId") `);
        await queryRunner.query(`CREATE TABLE "User" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar(191), "username" varchar(191) NOT NULL, "passwordHash" varchar(191) NOT NULL, "locale" varchar(191) NOT NULL DEFAULT ('zh-CN'), "defaultFamilyId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_4a257d2c9837248d70640b3e36e" UNIQUE ("email"), CONSTRAINT "UQ_29a05908a0fa0728526d2833657" UNIQUE ("username"))`);
        await queryRunner.query(`CREATE TABLE "Tag" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "name" varchar(191) NOT NULL, "color" varchar(191) NOT NULL DEFAULT ('#14b8a6'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_e8403bb80c5d063f00821dd69ac" UNIQUE ("familyId", "name"))`);
        await queryRunner.query(`CREATE TABLE "Template" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "name" varchar(191) NOT NULL, "description" varchar(191), "barcode" varchar(191), "imageId" integer, "quantity" integer NOT NULL DEFAULT (1), "price" decimal(12,2) NOT NULL DEFAULT (0), "model" varchar(191), "manufacturer" varchar(191), "defaultLocationId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_62fc4398ae3f752579d87ffa868" UNIQUE ("familyId", "barcode"))`);
        await queryRunner.query(`CREATE INDEX "IDX_898018e1360e27d31631b41c72" ON "Template" ("familyId", "name") `);
        await queryRunner.query(`CREATE TABLE "ItemUnit" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "itemId" integer NOT NULL, "sn" varchar(191), "locationId" integer, "note" varchar(191), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_fa576fa527eaa6ecc22d5da0418" UNIQUE ("familyId", "sn"))`);
        await queryRunner.query(`CREATE INDEX "IDX_de9ec71525a37888d490eac861" ON "ItemUnit" ("familyId", "locationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_aed10fc1e34c6f5759d85825cb" ON "ItemUnit" ("familyId", "itemId") `);
        await queryRunner.query(`CREATE TABLE "Item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "name" varchar(191) NOT NULL, "description" varchar(191), "quantity" integer NOT NULL DEFAULT (1), "price" decimal(12,2) NOT NULL DEFAULT (0), "model" varchar(191), "manufacturer" varchar(191), "barcode" varchar(191), "traceCode" varchar(191), "locationId" integer, "templateId" integer, "coverImageId" integer, "qrToken" varchar(191) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_fa2fa84b9b741736ecccc5e987a" UNIQUE ("qrToken"), CONSTRAINT "UQ_4a2611b009249881578eb0ba785" UNIQUE ("familyId", "traceCode"), CONSTRAINT "UQ_b6b9f63f8845175370afb8d20b0" UNIQUE ("familyId", "barcode"))`);
        await queryRunner.query(`CREATE INDEX "IDX_79fe46c7a551e4a4c609a4ef7f" ON "Item" ("familyId", "name") `);
        await queryRunner.query(`CREATE INDEX "IDX_6530c27b99a7fede3c9903b593" ON "Item" ("familyId", "locationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b0c71c2a39a41a06ba41d74ed9" ON "Item" ("familyId", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "Location" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "parentId" integer, "name" varchar(191) NOT NULL, "description" varchar(191), "imageId" integer, "sortIndex" double NOT NULL DEFAULT (0), "qrToken" varchar(191) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_7d7054854037776b44d977cb63a" UNIQUE ("qrToken"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4e6a0c91139990e2062dc22fe9" ON "Location" ("familyId", "parentId", "sortIndex") `);
        await queryRunner.query(`CREATE TABLE "NotificationChannel" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "type" varchar(191) NOT NULL, "name" varchar(191) NOT NULL, "enabled" boolean NOT NULL DEFAULT (1), "config" varchar(191) NOT NULL, "events" varchar(191) NOT NULL DEFAULT (''), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_54ba606cb5a5b1a562bc226758" ON "NotificationChannel" ("familyId") `);
        await queryRunner.query(`CREATE TABLE "Family" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(191) NOT NULL, "currency" varchar(191) NOT NULL DEFAULT ('CNY'), "locale" varchar(191) NOT NULL DEFAULT ('zh-CN'), "timeZone" varchar(191) NOT NULL DEFAULT ('Asia/Shanghai'), "isPersonal" boolean NOT NULL DEFAULT (0), "ownerId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "Attachment" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "key" varchar(191) NOT NULL, "url" varchar(191), "mime" varchar(191) NOT NULL, "size" integer NOT NULL, "uploadedById" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_62bd618c4503bd1dd3234235b4" ON "Attachment" ("familyId") `);
        await queryRunner.query(`CREATE TABLE "_TemplateTags" ("B" integer NOT NULL, "A" integer NOT NULL, PRIMARY KEY ("B", "A"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c55b9b333e905e1f21439fe7b9" ON "_TemplateTags" ("B") `);
        await queryRunner.query(`CREATE INDEX "IDX_446ebfca56f5d9b9bce20a49f9" ON "_TemplateTags" ("A") `);
        await queryRunner.query(`CREATE TABLE "_ItemImages" ("B" integer NOT NULL, "A" integer NOT NULL, PRIMARY KEY ("B", "A"))`);
        await queryRunner.query(`CREATE INDEX "IDX_14a6bcef5571dbbab26a7301d2" ON "_ItemImages" ("B") `);
        await queryRunner.query(`CREATE INDEX "IDX_d90e9591251b2a43ed1b485bc1" ON "_ItemImages" ("A") `);
        await queryRunner.query(`CREATE TABLE "_ItemTags" ("A" integer NOT NULL, "B" integer NOT NULL, PRIMARY KEY ("A", "B"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4ddff1474545a4a78386ee982a" ON "_ItemTags" ("A") `);
        await queryRunner.query(`CREATE INDEX "IDX_c2cf303c77cec519f0bc677153" ON "_ItemTags" ("B") `);
        await queryRunner.query(`DROP INDEX "IDX_1b3c9e23d4f499a9fe4501289f"`);
        await queryRunner.query(`CREATE TABLE "temporary_FamilyMember" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "userId" integer NOT NULL, "role" varchar(191) NOT NULL DEFAULT ('member'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_aee436d2ac963dff186c42d759b" UNIQUE ("familyId", "userId"), CONSTRAINT "FK_2d069a8ccc6f8270c523f4af4e9" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1b3c9e23d4f499a9fe4501289f2" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_FamilyMember"("id", "familyId", "userId", "role", "createdAt") SELECT "id", "familyId", "userId", "role", "createdAt" FROM "FamilyMember"`);
        await queryRunner.query(`DROP TABLE "FamilyMember"`);
        await queryRunner.query(`ALTER TABLE "temporary_FamilyMember" RENAME TO "FamilyMember"`);
        await queryRunner.query(`CREATE INDEX "IDX_1b3c9e23d4f499a9fe4501289f" ON "FamilyMember" ("userId") `);
        await queryRunner.query(`DROP INDEX "IDX_519dec9542647a659360ff2f2c"`);
        await queryRunner.query(`CREATE TABLE "temporary_FamilyInvite" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "token" varchar(191) NOT NULL, "createdById" integer NOT NULL, "expiresAt" datetime(3), "revokedAt" datetime(3), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_7da099066a06fffee6db8185c9d" UNIQUE ("token"), CONSTRAINT "FK_519dec9542647a659360ff2f2c6" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_aee74c7c75da1a8dd9ad750ef8e" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_FamilyInvite"("id", "familyId", "token", "createdById", "expiresAt", "revokedAt", "createdAt") SELECT "id", "familyId", "token", "createdById", "expiresAt", "revokedAt", "createdAt" FROM "FamilyInvite"`);
        await queryRunner.query(`DROP TABLE "FamilyInvite"`);
        await queryRunner.query(`ALTER TABLE "temporary_FamilyInvite" RENAME TO "FamilyInvite"`);
        await queryRunner.query(`CREATE INDEX "IDX_519dec9542647a659360ff2f2c" ON "FamilyInvite" ("familyId") `);
        await queryRunner.query(`CREATE TABLE "temporary_User" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar(191), "username" varchar(191) NOT NULL, "passwordHash" varchar(191) NOT NULL, "locale" varchar(191) NOT NULL DEFAULT ('zh-CN'), "defaultFamilyId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_4a257d2c9837248d70640b3e36e" UNIQUE ("email"), CONSTRAINT "UQ_29a05908a0fa0728526d2833657" UNIQUE ("username"), CONSTRAINT "FK_d9cacc0fba2ab08bfb9c9f53860" FOREIGN KEY ("defaultFamilyId") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_User"("id", "email", "username", "passwordHash", "locale", "defaultFamilyId", "createdAt", "updatedAt") SELECT "id", "email", "username", "passwordHash", "locale", "defaultFamilyId", "createdAt", "updatedAt" FROM "User"`);
        await queryRunner.query(`DROP TABLE "User"`);
        await queryRunner.query(`ALTER TABLE "temporary_User" RENAME TO "User"`);
        await queryRunner.query(`CREATE TABLE "temporary_Tag" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "name" varchar(191) NOT NULL, "color" varchar(191) NOT NULL DEFAULT ('#14b8a6'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_e8403bb80c5d063f00821dd69ac" UNIQUE ("familyId", "name"), CONSTRAINT "FK_3b203bc9fd1bed686cc632a3866" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_Tag"("id", "familyId", "name", "color", "createdAt") SELECT "id", "familyId", "name", "color", "createdAt" FROM "Tag"`);
        await queryRunner.query(`DROP TABLE "Tag"`);
        await queryRunner.query(`ALTER TABLE "temporary_Tag" RENAME TO "Tag"`);
        await queryRunner.query(`DROP INDEX "IDX_898018e1360e27d31631b41c72"`);
        await queryRunner.query(`CREATE TABLE "temporary_Template" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "name" varchar(191) NOT NULL, "description" varchar(191), "barcode" varchar(191), "imageId" integer, "quantity" integer NOT NULL DEFAULT (1), "price" decimal(12,2) NOT NULL DEFAULT (0), "model" varchar(191), "manufacturer" varchar(191), "defaultLocationId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_62fc4398ae3f752579d87ffa868" UNIQUE ("familyId", "barcode"), CONSTRAINT "FK_8e51d60558f7ecb3c7433365819" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_2ed84f7bdfd7ba3a8155f2ac603" FOREIGN KEY ("imageId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_443fa753f7ca346084fc73df2a6" FOREIGN KEY ("defaultLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_Template"("id", "familyId", "name", "description", "barcode", "imageId", "quantity", "price", "model", "manufacturer", "defaultLocationId", "createdAt", "updatedAt") SELECT "id", "familyId", "name", "description", "barcode", "imageId", "quantity", "price", "model", "manufacturer", "defaultLocationId", "createdAt", "updatedAt" FROM "Template"`);
        await queryRunner.query(`DROP TABLE "Template"`);
        await queryRunner.query(`ALTER TABLE "temporary_Template" RENAME TO "Template"`);
        await queryRunner.query(`CREATE INDEX "IDX_898018e1360e27d31631b41c72" ON "Template" ("familyId", "name") `);
        await queryRunner.query(`DROP INDEX "IDX_de9ec71525a37888d490eac861"`);
        await queryRunner.query(`DROP INDEX "IDX_aed10fc1e34c6f5759d85825cb"`);
        await queryRunner.query(`CREATE TABLE "temporary_ItemUnit" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "itemId" integer NOT NULL, "sn" varchar(191), "locationId" integer, "note" varchar(191), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_fa576fa527eaa6ecc22d5da0418" UNIQUE ("familyId", "sn"), CONSTRAINT "FK_2ef0429378cc894460ee853f71b" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_b3f0a0ad87d66cae87be0598190" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_092ddadb955739d43e33f3150ea" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_ItemUnit"("id", "familyId", "itemId", "sn", "locationId", "note", "createdAt", "updatedAt") SELECT "id", "familyId", "itemId", "sn", "locationId", "note", "createdAt", "updatedAt" FROM "ItemUnit"`);
        await queryRunner.query(`DROP TABLE "ItemUnit"`);
        await queryRunner.query(`ALTER TABLE "temporary_ItemUnit" RENAME TO "ItemUnit"`);
        await queryRunner.query(`CREATE INDEX "IDX_de9ec71525a37888d490eac861" ON "ItemUnit" ("familyId", "locationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_aed10fc1e34c6f5759d85825cb" ON "ItemUnit" ("familyId", "itemId") `);
        await queryRunner.query(`DROP INDEX "IDX_79fe46c7a551e4a4c609a4ef7f"`);
        await queryRunner.query(`DROP INDEX "IDX_6530c27b99a7fede3c9903b593"`);
        await queryRunner.query(`DROP INDEX "IDX_b0c71c2a39a41a06ba41d74ed9"`);
        await queryRunner.query(`CREATE TABLE "temporary_Item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "name" varchar(191) NOT NULL, "description" varchar(191), "quantity" integer NOT NULL DEFAULT (1), "price" decimal(12,2) NOT NULL DEFAULT (0), "model" varchar(191), "manufacturer" varchar(191), "barcode" varchar(191), "traceCode" varchar(191), "locationId" integer, "templateId" integer, "coverImageId" integer, "qrToken" varchar(191) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_fa2fa84b9b741736ecccc5e987a" UNIQUE ("qrToken"), CONSTRAINT "UQ_4a2611b009249881578eb0ba785" UNIQUE ("familyId", "traceCode"), CONSTRAINT "UQ_b6b9f63f8845175370afb8d20b0" UNIQUE ("familyId", "barcode"), CONSTRAINT "FK_2dee3a9141240f1c5706119e696" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_81bfd2a470f786abd1babac44cc" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_68d05b97558cbad80482e6444f6" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_294bd17c7561a6319da5b69a619" FOREIGN KEY ("coverImageId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_Item"("id", "familyId", "name", "description", "quantity", "price", "model", "manufacturer", "barcode", "traceCode", "locationId", "templateId", "coverImageId", "qrToken", "createdAt", "updatedAt") SELECT "id", "familyId", "name", "description", "quantity", "price", "model", "manufacturer", "barcode", "traceCode", "locationId", "templateId", "coverImageId", "qrToken", "createdAt", "updatedAt" FROM "Item"`);
        await queryRunner.query(`DROP TABLE "Item"`);
        await queryRunner.query(`ALTER TABLE "temporary_Item" RENAME TO "Item"`);
        await queryRunner.query(`CREATE INDEX "IDX_79fe46c7a551e4a4c609a4ef7f" ON "Item" ("familyId", "name") `);
        await queryRunner.query(`CREATE INDEX "IDX_6530c27b99a7fede3c9903b593" ON "Item" ("familyId", "locationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b0c71c2a39a41a06ba41d74ed9" ON "Item" ("familyId", "createdAt") `);
        await queryRunner.query(`DROP INDEX "IDX_4e6a0c91139990e2062dc22fe9"`);
        await queryRunner.query(`CREATE TABLE "temporary_Location" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "parentId" integer, "name" varchar(191) NOT NULL, "description" varchar(191), "imageId" integer, "sortIndex" double NOT NULL DEFAULT (0), "qrToken" varchar(191) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_7d7054854037776b44d977cb63a" UNIQUE ("qrToken"), CONSTRAINT "FK_a75c9398272a7a71b738cc3a8c8" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_65556fcd36c96e3f8385a7df6de" FOREIGN KEY ("parentId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_05edf5d8bf6368727b022c3ef1e" FOREIGN KEY ("imageId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_Location"("id", "familyId", "parentId", "name", "description", "imageId", "sortIndex", "qrToken", "createdAt", "updatedAt") SELECT "id", "familyId", "parentId", "name", "description", "imageId", "sortIndex", "qrToken", "createdAt", "updatedAt" FROM "Location"`);
        await queryRunner.query(`DROP TABLE "Location"`);
        await queryRunner.query(`ALTER TABLE "temporary_Location" RENAME TO "Location"`);
        await queryRunner.query(`CREATE INDEX "IDX_4e6a0c91139990e2062dc22fe9" ON "Location" ("familyId", "parentId", "sortIndex") `);
        await queryRunner.query(`DROP INDEX "IDX_54ba606cb5a5b1a562bc226758"`);
        await queryRunner.query(`CREATE TABLE "temporary_NotificationChannel" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "type" varchar(191) NOT NULL, "name" varchar(191) NOT NULL, "enabled" boolean NOT NULL DEFAULT (1), "config" varchar(191) NOT NULL, "events" varchar(191) NOT NULL DEFAULT (''), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_54ba606cb5a5b1a562bc2267580" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_NotificationChannel"("id", "familyId", "type", "name", "enabled", "config", "events", "createdAt", "updatedAt") SELECT "id", "familyId", "type", "name", "enabled", "config", "events", "createdAt", "updatedAt" FROM "NotificationChannel"`);
        await queryRunner.query(`DROP TABLE "NotificationChannel"`);
        await queryRunner.query(`ALTER TABLE "temporary_NotificationChannel" RENAME TO "NotificationChannel"`);
        await queryRunner.query(`CREATE INDEX "IDX_54ba606cb5a5b1a562bc226758" ON "NotificationChannel" ("familyId") `);
        await queryRunner.query(`CREATE TABLE "temporary_Family" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(191) NOT NULL, "currency" varchar(191) NOT NULL DEFAULT ('CNY'), "locale" varchar(191) NOT NULL DEFAULT ('zh-CN'), "timeZone" varchar(191) NOT NULL DEFAULT ('Asia/Shanghai'), "isPersonal" boolean NOT NULL DEFAULT (0), "ownerId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_a2080d57eda956cac073803ac1f" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_Family"("id", "name", "currency", "locale", "timeZone", "isPersonal", "ownerId", "createdAt", "updatedAt") SELECT "id", "name", "currency", "locale", "timeZone", "isPersonal", "ownerId", "createdAt", "updatedAt" FROM "Family"`);
        await queryRunner.query(`DROP TABLE "Family"`);
        await queryRunner.query(`ALTER TABLE "temporary_Family" RENAME TO "Family"`);
        await queryRunner.query(`DROP INDEX "IDX_62bd618c4503bd1dd3234235b4"`);
        await queryRunner.query(`CREATE TABLE "temporary_Attachment" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "key" varchar(191) NOT NULL, "url" varchar(191), "mime" varchar(191) NOT NULL, "size" integer NOT NULL, "uploadedById" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_62bd618c4503bd1dd3234235b41" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_27a322b7a8c9dc19335ed2f18ce" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_Attachment"("id", "familyId", "key", "url", "mime", "size", "uploadedById", "createdAt") SELECT "id", "familyId", "key", "url", "mime", "size", "uploadedById", "createdAt" FROM "Attachment"`);
        await queryRunner.query(`DROP TABLE "Attachment"`);
        await queryRunner.query(`ALTER TABLE "temporary_Attachment" RENAME TO "Attachment"`);
        await queryRunner.query(`CREATE INDEX "IDX_62bd618c4503bd1dd3234235b4" ON "Attachment" ("familyId") `);
        await queryRunner.query(`DROP INDEX "IDX_c55b9b333e905e1f21439fe7b9"`);
        await queryRunner.query(`DROP INDEX "IDX_446ebfca56f5d9b9bce20a49f9"`);
        await queryRunner.query(`CREATE TABLE "temporary__TemplateTags" ("B" integer NOT NULL, "A" integer NOT NULL, CONSTRAINT "FK_c55b9b333e905e1f21439fe7b9c" FOREIGN KEY ("B") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_446ebfca56f5d9b9bce20a49f90" FOREIGN KEY ("A") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("B", "A"))`);
        await queryRunner.query(`INSERT INTO "temporary__TemplateTags"("B", "A") SELECT "B", "A" FROM "_TemplateTags"`);
        await queryRunner.query(`DROP TABLE "_TemplateTags"`);
        await queryRunner.query(`ALTER TABLE "temporary__TemplateTags" RENAME TO "_TemplateTags"`);
        await queryRunner.query(`CREATE INDEX "IDX_c55b9b333e905e1f21439fe7b9" ON "_TemplateTags" ("B") `);
        await queryRunner.query(`CREATE INDEX "IDX_446ebfca56f5d9b9bce20a49f9" ON "_TemplateTags" ("A") `);
        await queryRunner.query(`DROP INDEX "IDX_14a6bcef5571dbbab26a7301d2"`);
        await queryRunner.query(`DROP INDEX "IDX_d90e9591251b2a43ed1b485bc1"`);
        await queryRunner.query(`CREATE TABLE "temporary__ItemImages" ("B" integer NOT NULL, "A" integer NOT NULL, CONSTRAINT "FK_14a6bcef5571dbbab26a7301d20" FOREIGN KEY ("B") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_d90e9591251b2a43ed1b485bc1b" FOREIGN KEY ("A") REFERENCES "Attachment" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("B", "A"))`);
        await queryRunner.query(`INSERT INTO "temporary__ItemImages"("B", "A") SELECT "B", "A" FROM "_ItemImages"`);
        await queryRunner.query(`DROP TABLE "_ItemImages"`);
        await queryRunner.query(`ALTER TABLE "temporary__ItemImages" RENAME TO "_ItemImages"`);
        await queryRunner.query(`CREATE INDEX "IDX_14a6bcef5571dbbab26a7301d2" ON "_ItemImages" ("B") `);
        await queryRunner.query(`CREATE INDEX "IDX_d90e9591251b2a43ed1b485bc1" ON "_ItemImages" ("A") `);
        await queryRunner.query(`DROP INDEX "IDX_4ddff1474545a4a78386ee982a"`);
        await queryRunner.query(`DROP INDEX "IDX_c2cf303c77cec519f0bc677153"`);
        await queryRunner.query(`CREATE TABLE "temporary__ItemTags" ("A" integer NOT NULL, "B" integer NOT NULL, CONSTRAINT "FK_4ddff1474545a4a78386ee982a7" FOREIGN KEY ("A") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_c2cf303c77cec519f0bc677153c" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("A", "B"))`);
        await queryRunner.query(`INSERT INTO "temporary__ItemTags"("A", "B") SELECT "A", "B" FROM "_ItemTags"`);
        await queryRunner.query(`DROP TABLE "_ItemTags"`);
        await queryRunner.query(`ALTER TABLE "temporary__ItemTags" RENAME TO "_ItemTags"`);
        await queryRunner.query(`CREATE INDEX "IDX_4ddff1474545a4a78386ee982a" ON "_ItemTags" ("A") `);
        await queryRunner.query(`CREATE INDEX "IDX_c2cf303c77cec519f0bc677153" ON "_ItemTags" ("B") `);
        // 外键索引：索引名必须与实体上的 @Index(...) 逐字一致（见 entities/foreign-key-index.ts）
        await queryRunner.query(`CREATE INDEX "IDX_Attachment_uploadedById" ON "Attachment" ("uploadedById")`);
        await queryRunner.query(`CREATE INDEX "IDX_Family_ownerId" ON "Family" ("ownerId")`);
        await queryRunner.query(`CREATE INDEX "IDX_FamilyInvite_createdById" ON "FamilyInvite" ("createdById")`);
        await queryRunner.query(`CREATE INDEX "IDX_Item_locationId" ON "Item" ("locationId")`);
        await queryRunner.query(`CREATE INDEX "IDX_Item_templateId" ON "Item" ("templateId")`);
        await queryRunner.query(`CREATE INDEX "IDX_Item_coverImageId" ON "Item" ("coverImageId")`);
        await queryRunner.query(`CREATE INDEX "IDX_ItemUnit_itemId" ON "ItemUnit" ("itemId")`);
        await queryRunner.query(`CREATE INDEX "IDX_ItemUnit_locationId" ON "ItemUnit" ("locationId")`);
        await queryRunner.query(`CREATE INDEX "IDX_Location_parentId" ON "Location" ("parentId")`);
        await queryRunner.query(`CREATE INDEX "IDX_Location_imageId" ON "Location" ("imageId")`);
        await queryRunner.query(`CREATE INDEX "IDX_Template_imageId" ON "Template" ("imageId")`);
        await queryRunner.query(`CREATE INDEX "IDX_Template_defaultLocationId" ON "Template" ("defaultLocationId")`);
        await queryRunner.query(`CREATE INDEX "IDX_User_defaultFamilyId" ON "User" ("defaultFamilyId")`);

    }

    /**
     * 回滚：删掉 Init 建的全部表。
     *
     * 旧实现先在这里做一遍 "DROP INDEX → RENAME TO temporary_X → 建无外键新表 → INSERT →
     * DROP TABLE temporary_X" 的往返，再统一删表 —— 这一步在 SQLite ≥ 3.25 上必然失败：
     * RENAME 会把**其它表**指向该表的外键一并改写成 temporary_x，紧接着
     * `DROP TABLE "temporary_Family"` 就报 `no such table: main.temporary_Attachment`，
     * 于是 Init 永远回滚不到底。回滚本来就只需要删表，所以直接删。
     *
     * 但直接删也有两个 SQLite 的坑（用 better-sqlite3 实测出来的）：
     *   1. `DROP TABLE T` 会隐式执行 `DELETE FROM T`。若还有其它表的数据引用着 T 的行，
     *      报 `FOREIGN KEY constraint failed`（例如 Family.ownerId 指着 User 的行）。
     *   2. 若 T 自己声明的外键指向的表已经被删掉，报 `no such table: main.X`
     *      （例如先删 Attachment，再删引用了它的 Location）。
     * 所以先按同一份「引用方在前」的顺序把每张表清空，再按同样顺序删表：清空之后
     * 第 1 类错误不会出现，而「引用方在前」保证了第 2 类错误不会出现。逐表判存使
     * 残缺状态（手工删过表、旧版本残留、Add* 迁移已先回滚）也能安全回滚。
     * 注意：这个顺序是外键图的逆拓扑序，新增表必须插到正确的位置（新表引用谁，
     * 就要排在谁前面，例如它引用了 Item 就必须排在 'Item' 之前）。
     * User 与 Family 互为外键（User.defaultFamilyId → Family、Family.ownerId → User）
     * 构成环，纯排序无解，靠「先清空」绕开：两表都没有行时，删任意一边都不会碰到
     * 对方的数据，实测这个顺序可以完整回滚。
     */
    public async down(queryRunner: QueryRunner): Promise<void> {
        const tables = [
            '_ItemTags', '_ItemImages', '_TemplateTags',
            'ActivityLog', 'NotificationChannel',
            'ItemUnit', 'Item', 'Template', 'Location', 'Attachment',
            'Tag', 'FamilyInvite', 'FamilyMember', 'Family', 'User',
        ];
        for (const table of tables) {
            if (await queryRunner.hasTable(table)) {
                await queryRunner.query(`DELETE FROM "${table}"`);
            }
        }
        // 索引随表一起消失，不必单独 DROP INDEX。
        for (const table of tables) {
            if (await queryRunner.hasTable(table)) {
                await queryRunner.query(`DROP TABLE "${table}"`);
            }
        }
    }

}
