-- CreateTable
CREATE TABLE "CalendarSeries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL,
    "intervalWeeks" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "seriesId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'MEETING',
    "visibility" TEXT NOT NULL DEFAULT 'INVITEES',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "response" TEXT NOT NULL DEFAULT 'PENDING',
    "responseNote" TEXT NOT NULL DEFAULT '',
    "respondedAt" TIMESTAMP(3),
    "attendance" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "attendanceNote" TEXT NOT NULL DEFAULT '',
    "attendanceAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CalendarInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarCommand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "CalendarCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSeries_companyId_id_key" ON "CalendarSeries"("companyId", "id");

-- CreateIndex
CREATE INDEX "CalendarEvent_companyId_start_end_idx" ON "CalendarEvent"("companyId", "start", "end");

-- CreateIndex
CREATE INDEX "CalendarEvent_companyId_seriesId_start_idx" ON "CalendarEvent"("companyId", "seriesId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_companyId_id_key" ON "CalendarEvent"("companyId", "id");

-- CreateIndex
CREATE INDEX "CalendarInvite_companyId_memberId_active_idx" ON "CalendarInvite"("companyId", "memberId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarInvite_companyId_eventId_memberId_key" ON "CalendarInvite"("companyId", "eventId", "memberId");

-- CreateIndex
CREATE INDEX "CalendarHistory_companyId_eventId_createdAt_idx" ON "CalendarHistory"("companyId", "eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarCommand_companyId_requestKey_key" ON "CalendarCommand"("companyId", "requestKey");

-- AddForeignKey
ALTER TABLE "CalendarSeries" ADD CONSTRAINT "CalendarSeries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_companyId_seriesId_fkey" FOREIGN KEY ("companyId", "seriesId") REFERENCES "CalendarSeries"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CalendarInvite" ADD CONSTRAINT "CalendarInvite_companyId_eventId_fkey" FOREIGN KEY ("companyId", "eventId") REFERENCES "CalendarEvent"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarInvite" ADD CONSTRAINT "CalendarInvite_companyId_memberId_fkey" FOREIGN KEY ("companyId", "memberId") REFERENCES "CompanyMember"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CalendarHistory" ADD CONSTRAINT "CalendarHistory_companyId_eventId_fkey" FOREIGN KEY ("companyId", "eventId") REFERENCES "CalendarEvent"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarCommand" ADD CONSTRAINT "CalendarCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
