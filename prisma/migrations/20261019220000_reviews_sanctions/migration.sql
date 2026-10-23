-- CreateTable
CREATE TABLE "HrTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrCampaign" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "privateNote" TEXT NOT NULL DEFAULT '',
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "scoreBps" INTEGER,
    "createdBy" TEXT NOT NULL,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "employeeComment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrRecordEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrRecordEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrCommand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "HrCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrTemplate_companyId_kind_archived_name_idx" ON "HrTemplate"("companyId", "kind", "archived", "name");

-- CreateIndex
CREATE UNIQUE INDEX "HrTemplate_companyId_id_key" ON "HrTemplate"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HrTemplate_companyId_kind_name_key" ON "HrTemplate"("companyId", "kind", "name");

-- CreateIndex
CREATE INDEX "HrCampaign_companyId_status_from_idx" ON "HrCampaign"("companyId", "status", "from");

-- CreateIndex
CREATE UNIQUE INDEX "HrCampaign_companyId_id_key" ON "HrCampaign"("companyId", "id");

-- CreateIndex
CREATE INDEX "HrRecord_companyId_kind_status_occurredAt_idx" ON "HrRecord"("companyId", "kind", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "HrRecord_companyId_memberId_kind_publishedAt_idx" ON "HrRecord"("companyId", "memberId", "kind", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HrRecord_companyId_id_key" ON "HrRecord"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HrRecord_companyId_campaignId_memberId_key" ON "HrRecord"("companyId", "campaignId", "memberId");

-- CreateIndex
CREATE INDEX "HrRecordEvent_companyId_recordId_createdAt_idx" ON "HrRecordEvent"("companyId", "recordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HrCommand_companyId_requestKey_key" ON "HrCommand"("companyId", "requestKey");

-- AddForeignKey
ALTER TABLE "HrTemplate" ADD CONSTRAINT "HrTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrCampaign" ADD CONSTRAINT "HrCampaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrCampaign" ADD CONSTRAINT "HrCampaign_companyId_templateId_fkey" FOREIGN KEY ("companyId", "templateId") REFERENCES "HrTemplate"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HrRecord" ADD CONSTRAINT "HrRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrRecord" ADD CONSTRAINT "HrRecord_companyId_memberId_fkey" FOREIGN KEY ("companyId", "memberId") REFERENCES "CompanyMember"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HrRecord" ADD CONSTRAINT "HrRecord_companyId_campaignId_fkey" FOREIGN KEY ("companyId", "campaignId") REFERENCES "HrCampaign"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HrRecordEvent" ADD CONSTRAINT "HrRecordEvent_companyId_recordId_fkey" FOREIGN KEY ("companyId", "recordId") REFERENCES "HrRecord"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrCommand" ADD CONSTRAINT "HrCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
