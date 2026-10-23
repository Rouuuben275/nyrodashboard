-- Additive only: no UPDATE/DELETE of existing ledger entries or permissions.
CREATE TABLE "FinanceAccount" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "type" TEXT NOT NULL, "isDefault" BOOLEAN NOT NULL DEFAULT false, "archived" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id"));
CREATE TABLE "FinanceCategory" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL, "archived" BOOLEAN NOT NULL DEFAULT false, CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id"));
CREATE TABLE "FinanceOperation" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "label" TEXT NOT NULL, "amount" INTEGER NOT NULL,
 "accountId" TEXT, "targetAccountId" TEXT, "categoryId" TEXT, "payment" TEXT NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "postedAt" TIMESTAMP(3), "createdBy" TEXT NOT NULL, "decidedBy" TEXT, "reason" TEXT NOT NULL DEFAULT '', "reversesId" TEXT, CONSTRAINT "FinanceOperation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "FinancialEntry" ADD COLUMN "occurredAt" TIMESTAMP(3), ADD COLUMN "accountId" TEXT, ADD COLUMN "categoryId" TEXT, ADD COLUMN "operationId" TEXT, ADD COLUMN "reversalOfId" TEXT, ADD COLUMN "effect" TEXT;
CREATE UNIQUE INDEX "FinanceAccount_companyId_id_key" ON "FinanceAccount"("companyId","id");
CREATE UNIQUE INDEX "FinanceAccount_companyId_name_key" ON "FinanceAccount"("companyId","name");
CREATE UNIQUE INDEX "FinanceCategory_companyId_id_key" ON "FinanceCategory"("companyId","id");
CREATE UNIQUE INDEX "FinanceCategory_companyId_name_key" ON "FinanceCategory"("companyId","name");
CREATE UNIQUE INDEX "FinanceOperation_companyId_id_key" ON "FinanceOperation"("companyId","id");
CREATE UNIQUE INDEX "FinanceOperation_companyId_requestKey_key" ON "FinanceOperation"("companyId","requestKey");
CREATE UNIQUE INDEX "FinanceOperation_companyId_reversesId_key" ON "FinanceOperation"("companyId","reversesId");
CREATE INDEX "FinanceOperation_companyId_status_createdAt_idx" ON "FinanceOperation"("companyId","status","createdAt");
CREATE UNIQUE INDEX "FinancialEntry_companyId_id_key" ON "FinancialEntry"("companyId","id");
CREATE UNIQUE INDEX "FinancialEntry_companyId_reversalOfId_key" ON "FinancialEntry"("companyId","reversalOfId");
CREATE INDEX "FinancialEntry_companyId_accountId_occurredAt_idx" ON "FinancialEntry"("companyId","accountId","occurredAt");
CREATE INDEX "FinancialEntry_companyId_operationId_idx" ON "FinancialEntry"("companyId","operationId");
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_companyId_accountId_fkey" FOREIGN KEY ("companyId","accountId") REFERENCES "FinanceAccount"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_companyId_targetAccountId_fkey" FOREIGN KEY ("companyId","targetAccountId") REFERENCES "FinanceAccount"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_companyId_categoryId_fkey" FOREIGN KEY ("companyId","categoryId") REFERENCES "FinanceCategory"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_companyId_reversesId_fkey" FOREIGN KEY ("companyId","reversesId") REFERENCES "FinanceOperation"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_companyId_accountId_fkey" FOREIGN KEY ("companyId","accountId") REFERENCES "FinanceAccount"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_companyId_categoryId_fkey" FOREIGN KEY ("companyId","categoryId") REFERENCES "FinanceCategory"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_companyId_operationId_fkey" FOREIGN KEY ("companyId","operationId") REFERENCES "FinanceOperation"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_companyId_reversalOfId_fkey" FOREIGN KEY ("companyId","reversalOfId") REFERENCES "FinancialEntry"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_kind_check" CHECK ("kind" IN ('INCOME','EXPENSE','OPENING','TRANSFER','REVERSAL'));
ALTER TABLE "FinanceOperation" ADD CONSTRAINT "FinanceOperation_amount_check" CHECK ("amount" <> 0 AND "amount" BETWEEN -100000000 AND 100000000);
CREATE UNIQUE INDEX "FinanceAccount_one_default_per_company" ON "FinanceAccount"("companyId") WHERE "isDefault" = true;
