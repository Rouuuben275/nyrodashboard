ALTER TABLE "TimeEntry" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "TimeEntry_companyId_id_key" ON "TimeEntry"("companyId","id");
CREATE TABLE "TimePause" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "entryId" TEXT NOT NULL, "start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "end" TIMESTAMP(3), "actorId" TEXT NOT NULL,
 CONSTRAINT "TimePause_pkey" PRIMARY KEY("id"),
 CONSTRAINT "TimePause_dates_check" CHECK ("end" IS NULL OR "end">="start"),
 CONSTRAINT "TimePause_entry_fkey" FOREIGN KEY("companyId","entryId") REFERENCES "TimeEntry"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TimePause_companyId_entryId_idx" ON "TimePause"("companyId","entryId");
CREATE UNIQUE INDEX "TimePause_one_open_key" ON "TimePause"("entryId") WHERE "end" IS NULL;
CREATE TABLE "TimeCorrection" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "entryId" TEXT NOT NULL, "revision" INTEGER NOT NULL, "start" TIMESTAMP(3) NOT NULL, "end" TIMESTAMP(3) NOT NULL, "pauseMinutes" INTEGER NOT NULL, "reason" TEXT NOT NULL, "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TimeCorrection_pkey" PRIMARY KEY("id"),
 CONSTRAINT "TimeCorrection_dates_check" CHECK ("end">"start" AND "pauseMinutes">=0 AND "pauseMinutes"*INTERVAL '1 minute' <= "end"-"start"),
 CONSTRAINT "TimeCorrection_entry_fkey" FOREIGN KEY("companyId","entryId") REFERENCES "TimeEntry"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TimeCorrection_companyId_entryId_revision_key" ON "TimeCorrection"("companyId","entryId","revision");
CREATE TABLE "TimeReview" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "entryId" TEXT NOT NULL, "revision" INTEGER NOT NULL, "status" TEXT NOT NULL, "reason" TEXT NOT NULL, "actorId" TEXT NOT NULL, "workedMinutes" INTEGER NOT NULL, "start" TIMESTAMP(3) NOT NULL, "end" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TimeReview_pkey" PRIMARY KEY("id"),
 CONSTRAINT "TimeReview_values_check" CHECK ("status" IN ('APPROVED','REJECTED') AND "workedMinutes">=0 AND "end">="start"),
 CONSTRAINT "TimeReview_entry_fkey" FOREIGN KEY("companyId","entryId") REFERENCES "TimeEntry"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TimeReview_companyId_entryId_revision_key" ON "TimeReview"("companyId","entryId","revision");
CREATE TABLE "TimeCommand" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "entryId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "revision" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TimeCommand_pkey" PRIMARY KEY("id"),
 CONSTRAINT "TimeCommand_entry_fkey" FOREIGN KEY("companyId","entryId") REFERENCES "TimeEntry"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TimeCommand_companyId_requestKey_key" ON "TimeCommand"("companyId","requestKey");
CREATE INDEX "TimeCommand_entryId_idx" ON "TimeCommand"("entryId");
