CREATE TABLE "LogoAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL CHECK ("purpose" IN ('company','server')),
  "data" BYTEA NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" > 0 AND "size" <= 262144),
  "width" INTEGER NOT NULL CHECK ("width" BETWEEN 1 AND 512),
  "height" INTEGER NOT NULL CHECK ("height" BETWEEN 1 AND 512),
  "attachedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LogoAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LogoAsset_ownerId_createdAt_idx" ON "LogoAsset"("ownerId","createdAt");
ALTER TABLE "Company" ADD COLUMN "logoUrl" TEXT NOT NULL DEFAULT '', ADD COLUMN "logoAssetId" TEXT;
ALTER TABLE "RPServer" ADD COLUMN "logoAssetId" TEXT;
CREATE UNIQUE INDEX "Company_logoAssetId_key" ON "Company"("logoAssetId");
CREATE UNIQUE INDEX "RPServer_logoAssetId_key" ON "RPServer"("logoAssetId");
ALTER TABLE "Company" ADD CONSTRAINT "Company_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "LogoAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RPServer" ADD CONSTRAINT "RPServer_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "LogoAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
