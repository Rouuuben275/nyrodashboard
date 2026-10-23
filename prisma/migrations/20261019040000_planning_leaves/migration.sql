CREATE TABLE "ShiftSeries" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "title" TEXT NOT NULL, "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ShiftSeries_pkey" PRIMARY KEY("id"), CONSTRAINT "ShiftSeries_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShiftSeries_companyId_id_key" ON "ShiftSeries"("companyId","id");
ALTER TABLE "Shift" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SCHEDULED', ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "cancelReason" TEXT, ADD COLUMN "cancelledBy" TEXT, ADD COLUMN "seriesId" TEXT;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_series_fkey" FOREIGN KEY("companyId","seriesId") REFERENCES "ShiftSeries"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE TABLE "MemberAvailability" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "start" TIMESTAMP(3) NOT NULL, "end" TIMESTAMP(3) NOT NULL, "kind" TEXT NOT NULL, "notes" TEXT NOT NULL DEFAULT '', "active" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 0, "cancelReason" TEXT,
 CONSTRAINT "MemberAvailability_pkey" PRIMARY KEY("id"), CONSTRAINT "MemberAvailability_values_check" CHECK ("end">"start" AND "kind" IN ('AVAILABLE','UNAVAILABLE')),
 CONSTRAINT "MemberAvailability_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "MemberAvailability_member_fkey" FOREIGN KEY("companyId","memberId") REFERENCES "CompanyMember"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MemberAvailability_companyId_memberId_start_idx" ON "MemberAvailability"("companyId","memberId","start");
CREATE TABLE "LeaveType" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "archived" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "LeaveType_pkey" PRIMARY KEY("id"), CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeaveType_companyId_id_key" ON "LeaveType"("companyId","id");
CREATE UNIQUE INDEX "LeaveType_companyId_code_key" ON "LeaveType"("companyId","code");
ALTER TABLE "LeaveRequest" ADD COLUMN "decidedAt" TIMESTAMP(3), ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "cancelReason" TEXT, ADD COLUMN "typeId" TEXT, ADD COLUMN "typeName" TEXT;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_type_fkey" FOREIGN KEY("companyId","typeId") REFERENCES "LeaveType"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE TABLE "ScheduleCommand" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "resultId" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ScheduleCommand_pkey" PRIMARY KEY("id"), CONSTRAINT "ScheduleCommand_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScheduleCommand_companyId_requestKey_key" ON "ScheduleCommand"("companyId","requestKey");
