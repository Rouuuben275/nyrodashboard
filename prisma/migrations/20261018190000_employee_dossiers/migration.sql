-- Additive employee records; no changes to existing users, grades or permissions.
CREATE TABLE "EmployeeProfile" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "memberId" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '', "jobTitle" TEXT NOT NULL DEFAULT '',
  "biography" TEXT NOT NULL DEFAULT '', "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeProfile_companyId_memberId_key" ON "EmployeeProfile"("companyId", "memberId");
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_companyId_memberId_fkey" FOREIGN KEY ("companyId", "memberId") REFERENCES "CompanyMember"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "EmployeeEvent" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "memberId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "content" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeEvent_companyId_memberId_createdAt_idx" ON "EmployeeEvent"("companyId", "memberId", "createdAt");
ALTER TABLE "EmployeeEvent" ADD CONSTRAINT "EmployeeEvent_companyId_memberId_fkey" FOREIGN KEY ("companyId", "memberId") REFERENCES "CompanyMember"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
