CREATE TABLE "RecruitmentJob" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL, "requirements" TEXT NOT NULL DEFAULT '', "location" TEXT NOT NULL DEFAULT '', "contractType" TEXT NOT NULL DEFAULT 'OTHER', "positions" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'DRAFT', "revision" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RecruitmentJob_pkey" PRIMARY KEY("id"), CONSTRAINT "RecruitmentJob_values_check" CHECK ("positions" BETWEEN 1 AND 100 AND "status" IN ('DRAFT','PUBLISHED','CLOSED')),
 CONSTRAINT "RecruitmentJob_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecruitmentJob_companyId_id_key" ON "RecruitmentJob"("companyId","id");
CREATE INDEX "RecruitmentJob_companyId_status_createdAt_idx" ON "RecruitmentJob"("companyId","status","createdAt");
CREATE TABLE "JobApplication" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "jobId" TEXT NOT NULL, "userId" TEXT NOT NULL, "jobTitle" TEXT NOT NULL, "characterName" TEXT NOT NULL, "phone" TEXT NOT NULL DEFAULT '', "motivation" TEXT NOT NULL, "availability" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'SUBMITTED', "revision" INTEGER NOT NULL DEFAULT 0, "interviewAt" TIMESTAMP(3), "interviewDetails" TEXT NOT NULL DEFAULT '', "decisionReason" TEXT NOT NULL DEFAULT '', "offeredRoleId" TEXT, "offeredRoleName" TEXT, "offeredDepartment" TEXT, "offeredSalary" INTEGER, "offeredBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "JobApplication_pkey" PRIMARY KEY("id"), CONSTRAINT "JobApplication_salary_check" CHECK ("offeredSalary" IS NULL OR "offeredSalary" BETWEEN 0 AND 100000000),
 CONSTRAINT "JobApplication_job_fkey" FOREIGN KEY("companyId","jobId") REFERENCES "RecruitmentJob"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "JobApplication_user_fkey" FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JobApplication_companyId_id_key" ON "JobApplication"("companyId","id");
CREATE UNIQUE INDEX "JobApplication_jobId_userId_key" ON "JobApplication"("jobId","userId");
CREATE INDEX "JobApplication_companyId_status_createdAt_idx" ON "JobApplication"("companyId","status","createdAt");
CREATE INDEX "JobApplication_userId_createdAt_idx" ON "JobApplication"("userId","createdAt");
CREATE TABLE "RecruitmentEvent" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "kind" TEXT NOT NULL, "content" TEXT NOT NULL, "details" JSONB NOT NULL DEFAULT '{}', "visibleToCandidate" BOOLEAN NOT NULL DEFAULT false, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RecruitmentEvent_pkey" PRIMARY KEY("id"), CONSTRAINT "RecruitmentEvent_application_fkey" FOREIGN KEY("companyId","applicationId") REFERENCES "JobApplication"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecruitmentEvent_companyId_applicationId_createdAt_idx" ON "RecruitmentEvent"("companyId","applicationId","createdAt");
CREATE TABLE "RecruitmentCommand" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "resultId" TEXT NOT NULL, "revision" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RecruitmentCommand_pkey" PRIMARY KEY("id"), CONSTRAINT "RecruitmentCommand_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecruitmentCommand_companyId_requestKey_key" ON "RecruitmentCommand"("companyId","requestKey");
