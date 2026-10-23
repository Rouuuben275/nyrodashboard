ALTER TABLE "Document" ADD COLUMN "targetType" TEXT, ADD COLUMN "targetId" TEXT;
ALTER TABLE "Document" ADD CONSTRAINT "Document_target_check" CHECK (("targetType" IS NULL AND "targetId" IS NULL) OR ("targetType" IN ('EMPLOYEE','LEAVE','EXPENSE','TASK','CLAIM') AND "targetId" IS NOT NULL AND "audience" = 'RECORD' AND "folderId" IS NULL));
CREATE INDEX "Document_companyId_targetType_targetId_archived_idx" ON "Document"("companyId","targetType","targetId","archived");
CREATE TABLE "ExpenseClaim" (
 "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL,
 "label" TEXT NOT NULL, "category" TEXT NOT NULL, "description" TEXT NOT NULL, "amount" INTEGER NOT NULL CHECK ("amount" > 0 AND "amount" <= 100000000), "spentOn" DATE NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','SUBMITTED','APPROVED','DECLINED','PAID','CANCELLED')), "revision" INTEGER NOT NULL DEFAULT 0,
 "submittedAt" TIMESTAMP(3), "decidedAt" TIMESTAMP(3), "decidedBy" TEXT, "paidAt" TIMESTAMP(3), "paymentReference" TEXT, "expenseId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ExpenseClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ExpenseClaim_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExpenseClaim_companyId_id_key" ON "ExpenseClaim"("companyId","id");
CREATE UNIQUE INDEX "ExpenseClaim_expenseId_key" ON "ExpenseClaim"("expenseId");
CREATE INDEX "ExpenseClaim_companyId_actorId_status_createdAt_idx" ON "ExpenseClaim"("companyId","actorId","status","createdAt");
CREATE TABLE "ExpenseClaimEvent" (
 "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "claimId" TEXT NOT NULL, "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL, "evidence" JSONB NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExpenseClaimEvent_companyId_claimId_fkey" FOREIGN KEY ("companyId","claimId") REFERENCES "ExpenseClaim"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ExpenseClaimEvent_companyId_claimId_createdAt_idx" ON "ExpenseClaimEvent"("companyId","claimId","createdAt");
