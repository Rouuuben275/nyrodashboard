-- Preserve all existing grades, memberships and permissions.
ALTER TABLE "CompanyRole" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 100;
CREATE INDEX "CompanyRole_companyId_position_idx" ON "CompanyRole"("companyId", "position");
