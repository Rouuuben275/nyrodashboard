-- CreateTable
CREATE TABLE "PayrollPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "memberId" TEXT,
    "roleId" TEXT,
    "mode" TEXT NOT NULL,
    "rate" INTEGER NOT NULL,
    "regularMinutes" INTEGER NOT NULL,
    "overtimeBps" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSlip" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "employeeName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "rate" INTEGER NOT NULL,
    "regularMinutes" INTEGER NOT NULL,
    "overtimeBps" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "workedMinutes" INTEGER NOT NULL,
    "overtimeMinutes" INTEGER NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "overtimeAmount" INTEGER NOT NULL,
    "salesAmount" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "bonus" INTEGER NOT NULL,
    "deduction" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "preparedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "accountLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollTime" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slipId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,

    CONSTRAINT "PayrollTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slipId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCommand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "PayrollCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPolicy_companyId_targetKey_key" ON "PayrollPolicy"("companyId", "targetKey");

-- CreateIndex
CREATE INDEX "PayrollRun_companyId_from_to_idx" ON "PayrollRun"("companyId", "from", "to");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_companyId_id_key" ON "PayrollRun"("companyId", "id");

-- CreateIndex
CREATE INDEX "PayrollSlip_companyId_memberId_status_idx" ON "PayrollSlip"("companyId", "memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSlip_companyId_id_key" ON "PayrollSlip"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSlip_companyId_runId_memberId_key" ON "PayrollSlip"("companyId", "runId", "memberId");

-- CreateIndex
CREATE INDEX "PayrollTime_companyId_entryId_idx" ON "PayrollTime"("companyId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollTime_companyId_slipId_entryId_key" ON "PayrollTime"("companyId", "slipId", "entryId");

-- CreateIndex
CREATE INDEX "PayrollEvent_companyId_slipId_createdAt_idx" ON "PayrollEvent"("companyId", "slipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCommand_companyId_requestKey_key" ON "PayrollCommand"("companyId", "requestKey");

-- AddForeignKey
ALTER TABLE "PayrollPolicy" ADD CONSTRAINT "PayrollPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPolicy" ADD CONSTRAINT "PayrollPolicy_companyId_memberId_fkey" FOREIGN KEY ("companyId", "memberId") REFERENCES "CompanyMember"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PayrollPolicy" ADD CONSTRAINT "PayrollPolicy_companyId_roleId_fkey" FOREIGN KEY ("companyId", "roleId") REFERENCES "CompanyRole"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_companyId_runId_fkey" FOREIGN KEY ("companyId", "runId") REFERENCES "PayrollRun"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_companyId_memberId_fkey" FOREIGN KEY ("companyId", "memberId") REFERENCES "CompanyMember"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PayrollTime" ADD CONSTRAINT "PayrollTime_companyId_slipId_fkey" FOREIGN KEY ("companyId", "slipId") REFERENCES "PayrollSlip"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_companyId_slipId_fkey" FOREIGN KEY ("companyId", "slipId") REFERENCES "PayrollSlip"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCommand" ADD CONSTRAINT "PayrollCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
