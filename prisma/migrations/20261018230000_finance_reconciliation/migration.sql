CREATE TABLE "FinanceReconciliation" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "accountId" TEXT, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "asOf" DATE NOT NULL, "observed" INTEGER NOT NULL, "ledgerBalance" BIGINT NOT NULL, "entryCount" INTEGER NOT NULL,
 "note" TEXT NOT NULL, "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FinanceReconciliation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "FinanceReconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "FinanceReconciliation_account_fkey" FOREIGN KEY ("companyId","accountId") REFERENCES "FinanceAccount"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "FinanceReconciliation_companyId_requestKey_key" ON "FinanceReconciliation"("companyId","requestKey");
CREATE INDEX "FinanceReconciliation_companyId_createdAt_idx" ON "FinanceReconciliation"("companyId","createdAt");
