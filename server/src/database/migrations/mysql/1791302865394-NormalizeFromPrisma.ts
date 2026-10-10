import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 把「Prisma 时代建立的老库」规范化成 TypeORM 的形状。
 *
 * 这个迁移**只对老库有意义**：把 decimal(65,30) 收紧成 decimal(12,2)、
 * datetime(3) 放宽成 datetime(6)、并把 Prisma 命名的外键（`<表>_<列>_fkey`）
 * 换成 TypeORM 的 FK_<hash>。
 *
 * ⚠️ 全新安装的库里没有这些 Prisma 命名的对象（Init 已按 TypeORM 形状建表），
 * 若照单执行，第一条 `DROP FOREIGN KEY \`FamilyMember_familyId_fkey\`` 就会
 * 报 ER_CANT_DROP_FIELD_OR_KEY（MySQL）/ no such column（SQLite）。
 * 因此 up() 先探测"库里是否还留着 Prisma 时代的痕迹"，没有就整体跳过。
 */
export class NormalizeFromPrisma1791302865394 implements MigrationInterface {
    name = 'NormalizeFromPrisma1791302865394'

    /**
     * 判断这是不是一个「Prisma 时代的老库」。
     *
     * 判据用外键命名：Prisma 建的外键以 `_fkey` 结尾（如 FamilyMember_familyId_fkey），
     * TypeORM 建的则是 `FK_<hash>`。这个信号正好对应本迁移要改写的那批对象。
     */
    private async isPrismaEraSchema(queryRunner: QueryRunner): Promise<boolean> {
        const rows: Array<{ n: number | string }> = await queryRunner.query(
            `SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND CONSTRAINT_TYPE = 'FOREIGN KEY'
               AND CONSTRAINT_NAME LIKE '%\\_fkey'`,
        );
        return Number(rows[0]?.n ?? 0) > 0;
    }

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 全新安装（Init 已按 TypeORM 形状建表）：没有需要规范化的东西，直接跳过。
        // 这一步是必需的 —— 否则空库第一次跑迁移就会失败。
        if (!(await this.isPrismaEraSchema(queryRunner))) return;

        await queryRunner.query(`ALTER TABLE \`FamilyMember\` DROP FOREIGN KEY \`FamilyMember_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` DROP FOREIGN KEY \`FamilyMember_userId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` DROP FOREIGN KEY \`FamilyInvite_createdById_fkey\``);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` DROP FOREIGN KEY \`FamilyInvite_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`User\` DROP FOREIGN KEY \`User_defaultFamilyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Tag\` DROP FOREIGN KEY \`Tag_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Template\` DROP FOREIGN KEY \`Template_defaultLocationId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Template\` DROP FOREIGN KEY \`Template_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Template\` DROP FOREIGN KEY \`Template_imageId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP FOREIGN KEY \`ItemUnit_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP FOREIGN KEY \`ItemUnit_itemId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP FOREIGN KEY \`ItemUnit_locationId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP FOREIGN KEY \`Item_coverImageId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP FOREIGN KEY \`Item_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP FOREIGN KEY \`Item_locationId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP FOREIGN KEY \`Item_templateId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Location\` DROP FOREIGN KEY \`Location_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Location\` DROP FOREIGN KEY \`Location_imageId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Location\` DROP FOREIGN KEY \`Location_parentId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`NotificationChannel\` DROP FOREIGN KEY \`NotificationChannel_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Family\` DROP FOREIGN KEY \`Family_ownerId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Attachment\` DROP FOREIGN KEY \`Attachment_familyId_fkey\``);
        await queryRunner.query(`ALTER TABLE \`Attachment\` DROP FOREIGN KEY \`Attachment_uploadedById_fkey\``);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` DROP FOREIGN KEY \`_TemplateTags_A_fkey\``);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` DROP FOREIGN KEY \`_TemplateTags_B_fkey\``);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` DROP FOREIGN KEY \`_ItemImages_A_fkey\``);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` DROP FOREIGN KEY \`_ItemImages_B_fkey\``);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` DROP FOREIGN KEY \`_ItemTags_A_fkey\``);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` DROP FOREIGN KEY \`_ItemTags_B_fkey\``);
        await queryRunner.query(`DROP INDEX \`FamilyMember_familyId_userId_key\` ON \`FamilyMember\``);
        await queryRunner.query(`DROP INDEX \`FamilyMember_userId_idx\` ON \`FamilyMember\``);
        await queryRunner.query(`DROP INDEX \`FamilyInvite_familyId_idx\` ON \`FamilyInvite\``);
        await queryRunner.query(`DROP INDEX \`FamilyInvite_token_key\` ON \`FamilyInvite\``);
        await queryRunner.query(`DROP INDEX \`User_email_key\` ON \`User\``);
        await queryRunner.query(`DROP INDEX \`User_username_key\` ON \`User\``);
        await queryRunner.query(`DROP INDEX \`Tag_familyId_name_key\` ON \`Tag\``);
        await queryRunner.query(`DROP INDEX \`Template_familyId_barcode_key\` ON \`Template\``);
        await queryRunner.query(`DROP INDEX \`Template_familyId_name_idx\` ON \`Template\``);
        await queryRunner.query(`DROP INDEX \`ItemUnit_familyId_itemId_idx\` ON \`ItemUnit\``);
        await queryRunner.query(`DROP INDEX \`ItemUnit_familyId_locationId_idx\` ON \`ItemUnit\``);
        await queryRunner.query(`DROP INDEX \`ItemUnit_familyId_sn_key\` ON \`ItemUnit\``);
        await queryRunner.query(`DROP INDEX \`Item_familyId_barcode_key\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`Item_familyId_createdAt_idx\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`Item_familyId_locationId_idx\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`Item_familyId_name_idx\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`Item_familyId_traceCode_key\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`Item_qrToken_key\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`Location_familyId_parentId_sortIndex_idx\` ON \`Location\``);
        await queryRunner.query(`DROP INDEX \`Location_qrToken_key\` ON \`Location\``);
        await queryRunner.query(`DROP INDEX \`NotificationChannel_familyId_idx\` ON \`NotificationChannel\``);
        await queryRunner.query(`DROP INDEX \`Attachment_familyId_idx\` ON \`Attachment\``);
        await queryRunner.query(`DROP INDEX \`_TemplateTags_AB_unique\` ON \`_TemplateTags\``);
        await queryRunner.query(`DROP INDEX \`_TemplateTags_B_index\` ON \`_TemplateTags\``);
        await queryRunner.query(`DROP INDEX \`_ItemImages_AB_unique\` ON \`_ItemImages\``);
        await queryRunner.query(`DROP INDEX \`_ItemImages_B_index\` ON \`_ItemImages\``);
        await queryRunner.query(`DROP INDEX \`_ItemTags_AB_unique\` ON \`_ItemTags\``);
        await queryRunner.query(`DROP INDEX \`_ItemTags_B_index\` ON \`_ItemTags\``);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` ADD PRIMARY KEY (\`B\`, \`A\`)`);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` ADD PRIMARY KEY (\`B\`, \`A\`)`);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` ADD PRIMARY KEY (\`A\`, \`B\`)`);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` ADD UNIQUE INDEX \`IDX_7da099066a06fffee6db8185c9\` (\`token\`)`);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`User\` ADD UNIQUE INDEX \`IDX_4a257d2c9837248d70640b3e36\` (\`email\`)`);
        await queryRunner.query(`ALTER TABLE \`User\` ADD UNIQUE INDEX \`IDX_29a05908a0fa0728526d283365\` (\`username\`)`);
        await queryRunner.query(`ALTER TABLE \`User\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`User\` CHANGE \`updatedAt\` \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Tag\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Template\` CHANGE \`price\` \`price\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
        await queryRunner.query(`ALTER TABLE \`Template\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Template\` CHANGE \`updatedAt\` \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` CHANGE \`updatedAt\` \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Item\` CHANGE \`price\` \`price\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD UNIQUE INDEX \`IDX_fa2fa84b9b741736ecccc5e987\` (\`qrToken\`)`);
        await queryRunner.query(`ALTER TABLE \`Item\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Item\` CHANGE \`updatedAt\` \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Location\` ADD UNIQUE INDEX \`IDX_7d7054854037776b44d977cb63\` (\`qrToken\`)`);
        await queryRunner.query(`ALTER TABLE \`Location\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Location\` CHANGE \`updatedAt\` \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`NotificationChannel\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`NotificationChannel\` CHANGE \`updatedAt\` \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Family\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Family\` CHANGE \`updatedAt\` \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`Attachment\` CHANGE \`createdAt\` \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`CREATE INDEX \`IDX_1b3c9e23d4f499a9fe4501289f\` ON \`FamilyMember\` (\`userId\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_aee436d2ac963dff186c42d759\` ON \`FamilyMember\` (\`familyId\`, \`userId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_519dec9542647a659360ff2f2c\` ON \`FamilyInvite\` (\`familyId\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_e8403bb80c5d063f00821dd69a\` ON \`Tag\` (\`familyId\`, \`name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_898018e1360e27d31631b41c72\` ON \`Template\` (\`familyId\`, \`name\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_62fc4398ae3f752579d87ffa86\` ON \`Template\` (\`familyId\`, \`barcode\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_de9ec71525a37888d490eac861\` ON \`ItemUnit\` (\`familyId\`, \`locationId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_aed10fc1e34c6f5759d85825cb\` ON \`ItemUnit\` (\`familyId\`, \`itemId\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_fa576fa527eaa6ecc22d5da041\` ON \`ItemUnit\` (\`familyId\`, \`sn\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_79fe46c7a551e4a4c609a4ef7f\` ON \`Item\` (\`familyId\`, \`name\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_6530c27b99a7fede3c9903b593\` ON \`Item\` (\`familyId\`, \`locationId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_b0c71c2a39a41a06ba41d74ed9\` ON \`Item\` (\`familyId\`, \`createdAt\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_4a2611b009249881578eb0ba78\` ON \`Item\` (\`familyId\`, \`traceCode\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_b6b9f63f8845175370afb8d20b\` ON \`Item\` (\`familyId\`, \`barcode\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_4e6a0c91139990e2062dc22fe9\` ON \`Location\` (\`familyId\`, \`parentId\`, \`sortIndex\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_54ba606cb5a5b1a562bc226758\` ON \`NotificationChannel\` (\`familyId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_62bd618c4503bd1dd3234235b4\` ON \`Attachment\` (\`familyId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_c55b9b333e905e1f21439fe7b9\` ON \`_TemplateTags\` (\`B\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_446ebfca56f5d9b9bce20a49f9\` ON \`_TemplateTags\` (\`A\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_14a6bcef5571dbbab26a7301d2\` ON \`_ItemImages\` (\`B\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_d90e9591251b2a43ed1b485bc1\` ON \`_ItemImages\` (\`A\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_4ddff1474545a4a78386ee982a\` ON \`_ItemTags\` (\`A\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_c2cf303c77cec519f0bc677153\` ON \`_ItemTags\` (\`B\`)`);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` ADD CONSTRAINT \`FK_2d069a8ccc6f8270c523f4af4e9\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` ADD CONSTRAINT \`FK_1b3c9e23d4f499a9fe4501289f2\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` ADD CONSTRAINT \`FK_519dec9542647a659360ff2f2c6\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` ADD CONSTRAINT \`FK_aee74c7c75da1a8dd9ad750ef8e\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`User\` ADD CONSTRAINT \`FK_d9cacc0fba2ab08bfb9c9f53860\` FOREIGN KEY (\`defaultFamilyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Tag\` ADD CONSTRAINT \`FK_3b203bc9fd1bed686cc632a3866\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Template\` ADD CONSTRAINT \`FK_8e51d60558f7ecb3c7433365819\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Template\` ADD CONSTRAINT \`FK_2ed84f7bdfd7ba3a8155f2ac603\` FOREIGN KEY (\`imageId\`) REFERENCES \`Attachment\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Template\` ADD CONSTRAINT \`FK_443fa753f7ca346084fc73df2a6\` FOREIGN KEY (\`defaultLocationId\`) REFERENCES \`Location\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD CONSTRAINT \`FK_2ef0429378cc894460ee853f71b\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD CONSTRAINT \`FK_b3f0a0ad87d66cae87be0598190\` FOREIGN KEY (\`itemId\`) REFERENCES \`Item\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD CONSTRAINT \`FK_092ddadb955739d43e33f3150ea\` FOREIGN KEY (\`locationId\`) REFERENCES \`Location\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD CONSTRAINT \`FK_2dee3a9141240f1c5706119e696\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD CONSTRAINT \`FK_81bfd2a470f786abd1babac44cc\` FOREIGN KEY (\`locationId\`) REFERENCES \`Location\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD CONSTRAINT \`FK_68d05b97558cbad80482e6444f6\` FOREIGN KEY (\`templateId\`) REFERENCES \`Template\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD CONSTRAINT \`FK_294bd17c7561a6319da5b69a619\` FOREIGN KEY (\`coverImageId\`) REFERENCES \`Attachment\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Location\` ADD CONSTRAINT \`FK_a75c9398272a7a71b738cc3a8c8\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Location\` ADD CONSTRAINT \`FK_65556fcd36c96e3f8385a7df6de\` FOREIGN KEY (\`parentId\`) REFERENCES \`Location\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Location\` ADD CONSTRAINT \`FK_05edf5d8bf6368727b022c3ef1e\` FOREIGN KEY (\`imageId\`) REFERENCES \`Attachment\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`NotificationChannel\` ADD CONSTRAINT \`FK_54ba606cb5a5b1a562bc2267580\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Family\` ADD CONSTRAINT \`FK_a2080d57eda956cac073803ac1f\` FOREIGN KEY (\`ownerId\`) REFERENCES \`User\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Attachment\` ADD CONSTRAINT \`FK_62bd618c4503bd1dd3234235b41\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`Attachment\` ADD CONSTRAINT \`FK_27a322b7a8c9dc19335ed2f18ce\` FOREIGN KEY (\`uploadedById\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` ADD CONSTRAINT \`FK_c55b9b333e905e1f21439fe7b9c\` FOREIGN KEY (\`B\`) REFERENCES \`Template\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` ADD CONSTRAINT \`FK_446ebfca56f5d9b9bce20a49f90\` FOREIGN KEY (\`A\`) REFERENCES \`Tag\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` ADD CONSTRAINT \`FK_14a6bcef5571dbbab26a7301d20\` FOREIGN KEY (\`B\`) REFERENCES \`Item\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` ADD CONSTRAINT \`FK_d90e9591251b2a43ed1b485bc1b\` FOREIGN KEY (\`A\`) REFERENCES \`Attachment\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` ADD CONSTRAINT \`FK_4ddff1474545a4a78386ee982a7\` FOREIGN KEY (\`A\`) REFERENCES \`Item\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` ADD CONSTRAINT \`FK_c2cf303c77cec519f0bc677153c\` FOREIGN KEY (\`B\`) REFERENCES \`Tag\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 与 up() 用同一个守卫：只有 Prisma 时代的老库才存在需要"反向改写"的结构。
        // 没有它会出事：在全新库上 revert 到这一步会真的执行 DROP FOREIGN KEY、把
        // createdAt 改回 datetime(3)、price 改回 decimal(65,30)，而 MySQL 的 DDL 是隐式提交的，
        // migrationsTransactionMode: 'all' 也回滚不了 —— 库里会留下半应用状态，
        // 接着 Revert 到 Init 时它的 DROP FOREIGN KEY 又报 "Can't DROP ... check that column/key exists"。
        // 代价是：在真正跑过 up() 的老库上 revert 也会被跳过（那时结构已经不是 Prisma 形状了），
        // 即不提供"退回 Prisma 结构"的能力 —— 那本来就是明确不支持的操作，要退回请用备份恢复。
        if (!(await this.isPrismaEraSchema(queryRunner))) return;

        await queryRunner.query(`ALTER TABLE \`_ItemTags\` DROP FOREIGN KEY \`FK_c2cf303c77cec519f0bc677153c\``);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` DROP FOREIGN KEY \`FK_4ddff1474545a4a78386ee982a7\``);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` DROP FOREIGN KEY \`FK_d90e9591251b2a43ed1b485bc1b\``);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` DROP FOREIGN KEY \`FK_14a6bcef5571dbbab26a7301d20\``);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` DROP FOREIGN KEY \`FK_446ebfca56f5d9b9bce20a49f90\``);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` DROP FOREIGN KEY \`FK_c55b9b333e905e1f21439fe7b9c\``);
        await queryRunner.query(`ALTER TABLE \`Attachment\` DROP FOREIGN KEY \`FK_27a322b7a8c9dc19335ed2f18ce\``);
        await queryRunner.query(`ALTER TABLE \`Attachment\` DROP FOREIGN KEY \`FK_62bd618c4503bd1dd3234235b41\``);
        await queryRunner.query(`ALTER TABLE \`Family\` DROP FOREIGN KEY \`FK_a2080d57eda956cac073803ac1f\``);
        await queryRunner.query(`ALTER TABLE \`NotificationChannel\` DROP FOREIGN KEY \`FK_54ba606cb5a5b1a562bc2267580\``);
        await queryRunner.query(`ALTER TABLE \`Location\` DROP FOREIGN KEY \`FK_05edf5d8bf6368727b022c3ef1e\``);
        await queryRunner.query(`ALTER TABLE \`Location\` DROP FOREIGN KEY \`FK_65556fcd36c96e3f8385a7df6de\``);
        await queryRunner.query(`ALTER TABLE \`Location\` DROP FOREIGN KEY \`FK_a75c9398272a7a71b738cc3a8c8\``);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP FOREIGN KEY \`FK_294bd17c7561a6319da5b69a619\``);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP FOREIGN KEY \`FK_68d05b97558cbad80482e6444f6\``);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP FOREIGN KEY \`FK_81bfd2a470f786abd1babac44cc\``);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP FOREIGN KEY \`FK_2dee3a9141240f1c5706119e696\``);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP FOREIGN KEY \`FK_092ddadb955739d43e33f3150ea\``);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP FOREIGN KEY \`FK_b3f0a0ad87d66cae87be0598190\``);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP FOREIGN KEY \`FK_2ef0429378cc894460ee853f71b\``);
        await queryRunner.query(`ALTER TABLE \`Template\` DROP FOREIGN KEY \`FK_443fa753f7ca346084fc73df2a6\``);
        await queryRunner.query(`ALTER TABLE \`Template\` DROP FOREIGN KEY \`FK_2ed84f7bdfd7ba3a8155f2ac603\``);
        await queryRunner.query(`ALTER TABLE \`Template\` DROP FOREIGN KEY \`FK_8e51d60558f7ecb3c7433365819\``);
        await queryRunner.query(`ALTER TABLE \`Tag\` DROP FOREIGN KEY \`FK_3b203bc9fd1bed686cc632a3866\``);
        await queryRunner.query(`ALTER TABLE \`User\` DROP FOREIGN KEY \`FK_d9cacc0fba2ab08bfb9c9f53860\``);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` DROP FOREIGN KEY \`FK_aee74c7c75da1a8dd9ad750ef8e\``);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` DROP FOREIGN KEY \`FK_519dec9542647a659360ff2f2c6\``);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` DROP FOREIGN KEY \`FK_1b3c9e23d4f499a9fe4501289f2\``);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` DROP FOREIGN KEY \`FK_2d069a8ccc6f8270c523f4af4e9\``);
        await queryRunner.query(`DROP INDEX \`IDX_c2cf303c77cec519f0bc677153\` ON \`_ItemTags\``);
        await queryRunner.query(`DROP INDEX \`IDX_4ddff1474545a4a78386ee982a\` ON \`_ItemTags\``);
        await queryRunner.query(`DROP INDEX \`IDX_d90e9591251b2a43ed1b485bc1\` ON \`_ItemImages\``);
        await queryRunner.query(`DROP INDEX \`IDX_14a6bcef5571dbbab26a7301d2\` ON \`_ItemImages\``);
        await queryRunner.query(`DROP INDEX \`IDX_446ebfca56f5d9b9bce20a49f9\` ON \`_TemplateTags\``);
        await queryRunner.query(`DROP INDEX \`IDX_c55b9b333e905e1f21439fe7b9\` ON \`_TemplateTags\``);
        await queryRunner.query(`DROP INDEX \`IDX_62bd618c4503bd1dd3234235b4\` ON \`Attachment\``);
        await queryRunner.query(`DROP INDEX \`IDX_54ba606cb5a5b1a562bc226758\` ON \`NotificationChannel\``);
        await queryRunner.query(`DROP INDEX \`IDX_4e6a0c91139990e2062dc22fe9\` ON \`Location\``);
        await queryRunner.query(`DROP INDEX \`IDX_b6b9f63f8845175370afb8d20b\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`IDX_4a2611b009249881578eb0ba78\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`IDX_b0c71c2a39a41a06ba41d74ed9\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`IDX_6530c27b99a7fede3c9903b593\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`IDX_79fe46c7a551e4a4c609a4ef7f\` ON \`Item\``);
        await queryRunner.query(`DROP INDEX \`IDX_fa576fa527eaa6ecc22d5da041\` ON \`ItemUnit\``);
        await queryRunner.query(`DROP INDEX \`IDX_aed10fc1e34c6f5759d85825cb\` ON \`ItemUnit\``);
        await queryRunner.query(`DROP INDEX \`IDX_de9ec71525a37888d490eac861\` ON \`ItemUnit\``);
        await queryRunner.query(`DROP INDEX \`IDX_62fc4398ae3f752579d87ffa86\` ON \`Template\``);
        await queryRunner.query(`DROP INDEX \`IDX_898018e1360e27d31631b41c72\` ON \`Template\``);
        await queryRunner.query(`DROP INDEX \`IDX_e8403bb80c5d063f00821dd69a\` ON \`Tag\``);
        await queryRunner.query(`DROP INDEX \`IDX_519dec9542647a659360ff2f2c\` ON \`FamilyInvite\``);
        await queryRunner.query(`DROP INDEX \`IDX_aee436d2ac963dff186c42d759\` ON \`FamilyMember\``);
        await queryRunner.query(`DROP INDEX \`IDX_1b3c9e23d4f499a9fe4501289f\` ON \`FamilyMember\``);
        await queryRunner.query(`ALTER TABLE \`Attachment\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`Family\` CHANGE \`updatedAt\` \`updatedAt\` datetime(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`Family\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`NotificationChannel\` CHANGE \`updatedAt\` \`updatedAt\` datetime(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`NotificationChannel\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`Location\` CHANGE \`updatedAt\` \`updatedAt\` datetime(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`Location\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`Location\` DROP INDEX \`IDX_7d7054854037776b44d977cb63\``);
        await queryRunner.query(`ALTER TABLE \`Item\` CHANGE \`updatedAt\` \`updatedAt\` datetime(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`Item\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`Item\` DROP INDEX \`IDX_fa2fa84b9b741736ecccc5e987\``);
        await queryRunner.query(`ALTER TABLE \`Item\` CHANGE \`price\` \`price\` decimal(65,30) NOT NULL DEFAULT '0.000000000000000000000000000000'`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` CHANGE \`updatedAt\` \`updatedAt\` datetime(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`Template\` CHANGE \`updatedAt\` \`updatedAt\` datetime(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`Template\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`Template\` CHANGE \`price\` \`price\` decimal(65,30) NOT NULL DEFAULT '0.000000000000000000000000000000'`);
        await queryRunner.query(`ALTER TABLE \`Tag\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`User\` CHANGE \`updatedAt\` \`updatedAt\` datetime(3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`User\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`User\` DROP INDEX \`IDX_29a05908a0fa0728526d283365\``);
        await queryRunner.query(`ALTER TABLE \`User\` DROP INDEX \`IDX_4a257d2c9837248d70640b3e36\``);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` DROP INDEX \`IDX_7da099066a06fffee6db8185c9\``);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` CHANGE \`createdAt\` \`createdAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` DROP PRIMARY KEY`);
        await queryRunner.query(`CREATE INDEX \`_ItemTags_B_index\` ON \`_ItemTags\` (\`B\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`_ItemTags_AB_unique\` ON \`_ItemTags\` (\`A\`, \`B\`)`);
        await queryRunner.query(`CREATE INDEX \`_ItemImages_B_index\` ON \`_ItemImages\` (\`B\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`_ItemImages_AB_unique\` ON \`_ItemImages\` (\`A\`, \`B\`)`);
        await queryRunner.query(`CREATE INDEX \`_TemplateTags_B_index\` ON \`_TemplateTags\` (\`B\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`_TemplateTags_AB_unique\` ON \`_TemplateTags\` (\`A\`, \`B\`)`);
        await queryRunner.query(`CREATE INDEX \`Attachment_familyId_idx\` ON \`Attachment\` (\`familyId\`)`);
        await queryRunner.query(`CREATE INDEX \`NotificationChannel_familyId_idx\` ON \`NotificationChannel\` (\`familyId\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`Location_qrToken_key\` ON \`Location\` (\`qrToken\`)`);
        await queryRunner.query(`CREATE INDEX \`Location_familyId_parentId_sortIndex_idx\` ON \`Location\` (\`familyId\`, \`parentId\`, \`sortIndex\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`Item_qrToken_key\` ON \`Item\` (\`qrToken\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`Item_familyId_traceCode_key\` ON \`Item\` (\`familyId\`, \`traceCode\`)`);
        await queryRunner.query(`CREATE INDEX \`Item_familyId_name_idx\` ON \`Item\` (\`familyId\`, \`name\`)`);
        await queryRunner.query(`CREATE INDEX \`Item_familyId_locationId_idx\` ON \`Item\` (\`familyId\`, \`locationId\`)`);
        await queryRunner.query(`CREATE INDEX \`Item_familyId_createdAt_idx\` ON \`Item\` (\`familyId\`, \`createdAt\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`Item_familyId_barcode_key\` ON \`Item\` (\`familyId\`, \`barcode\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`ItemUnit_familyId_sn_key\` ON \`ItemUnit\` (\`familyId\`, \`sn\`)`);
        await queryRunner.query(`CREATE INDEX \`ItemUnit_familyId_locationId_idx\` ON \`ItemUnit\` (\`familyId\`, \`locationId\`)`);
        await queryRunner.query(`CREATE INDEX \`ItemUnit_familyId_itemId_idx\` ON \`ItemUnit\` (\`familyId\`, \`itemId\`)`);
        await queryRunner.query(`CREATE INDEX \`Template_familyId_name_idx\` ON \`Template\` (\`familyId\`, \`name\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`Template_familyId_barcode_key\` ON \`Template\` (\`familyId\`, \`barcode\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`Tag_familyId_name_key\` ON \`Tag\` (\`familyId\`, \`name\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`User_username_key\` ON \`User\` (\`username\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`User_email_key\` ON \`User\` (\`email\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`FamilyInvite_token_key\` ON \`FamilyInvite\` (\`token\`)`);
        await queryRunner.query(`CREATE INDEX \`FamilyInvite_familyId_idx\` ON \`FamilyInvite\` (\`familyId\`)`);
        await queryRunner.query(`CREATE INDEX \`FamilyMember_userId_idx\` ON \`FamilyMember\` (\`userId\`)`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`FamilyMember_familyId_userId_key\` ON \`FamilyMember\` (\`familyId\`, \`userId\`)`);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` ADD CONSTRAINT \`_ItemTags_B_fkey\` FOREIGN KEY (\`B\`) REFERENCES \`Tag\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_ItemTags\` ADD CONSTRAINT \`_ItemTags_A_fkey\` FOREIGN KEY (\`A\`) REFERENCES \`Item\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` ADD CONSTRAINT \`_ItemImages_B_fkey\` FOREIGN KEY (\`B\`) REFERENCES \`Item\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_ItemImages\` ADD CONSTRAINT \`_ItemImages_A_fkey\` FOREIGN KEY (\`A\`) REFERENCES \`Attachment\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` ADD CONSTRAINT \`_TemplateTags_B_fkey\` FOREIGN KEY (\`B\`) REFERENCES \`Template\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`_TemplateTags\` ADD CONSTRAINT \`_TemplateTags_A_fkey\` FOREIGN KEY (\`A\`) REFERENCES \`Tag\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Attachment\` ADD CONSTRAINT \`Attachment_uploadedById_fkey\` FOREIGN KEY (\`uploadedById\`) REFERENCES \`User\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Attachment\` ADD CONSTRAINT \`Attachment_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Family\` ADD CONSTRAINT \`Family_ownerId_fkey\` FOREIGN KEY (\`ownerId\`) REFERENCES \`User\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`NotificationChannel\` ADD CONSTRAINT \`NotificationChannel_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Location\` ADD CONSTRAINT \`Location_parentId_fkey\` FOREIGN KEY (\`parentId\`) REFERENCES \`Location\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Location\` ADD CONSTRAINT \`Location_imageId_fkey\` FOREIGN KEY (\`imageId\`) REFERENCES \`Attachment\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Location\` ADD CONSTRAINT \`Location_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD CONSTRAINT \`Item_templateId_fkey\` FOREIGN KEY (\`templateId\`) REFERENCES \`Template\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD CONSTRAINT \`Item_locationId_fkey\` FOREIGN KEY (\`locationId\`) REFERENCES \`Location\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD CONSTRAINT \`Item_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Item\` ADD CONSTRAINT \`Item_coverImageId_fkey\` FOREIGN KEY (\`coverImageId\`) REFERENCES \`Attachment\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD CONSTRAINT \`ItemUnit_locationId_fkey\` FOREIGN KEY (\`locationId\`) REFERENCES \`Location\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD CONSTRAINT \`ItemUnit_itemId_fkey\` FOREIGN KEY (\`itemId\`) REFERENCES \`Item\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD CONSTRAINT \`ItemUnit_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Template\` ADD CONSTRAINT \`Template_imageId_fkey\` FOREIGN KEY (\`imageId\`) REFERENCES \`Attachment\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Template\` ADD CONSTRAINT \`Template_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Template\` ADD CONSTRAINT \`Template_defaultLocationId_fkey\` FOREIGN KEY (\`defaultLocationId\`) REFERENCES \`Location\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`Tag\` ADD CONSTRAINT \`Tag_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`User\` ADD CONSTRAINT \`User_defaultFamilyId_fkey\` FOREIGN KEY (\`defaultFamilyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` ADD CONSTRAINT \`FamilyInvite_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`FamilyInvite\` ADD CONSTRAINT \`FamilyInvite_createdById_fkey\` FOREIGN KEY (\`createdById\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` ADD CONSTRAINT \`FamilyMember_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`FamilyMember\` ADD CONSTRAINT \`FamilyMember_familyId_fkey\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
