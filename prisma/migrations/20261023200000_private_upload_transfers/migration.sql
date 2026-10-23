-- Temporary, private, resumable staging only. Existing documents are not changed.
CREATE TABLE "UploadTransfer" (
 "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('LIBRARY','RECORD')), "metadata" JSONB NOT NULL, "fingerprint" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL, "totalSize" INTEGER NOT NULL CHECK ("totalSize" BETWEEN 1 AND 5242880), "digest" TEXT NOT NULL,
 "nextPart" INTEGER NOT NULL DEFAULT 0 CHECK ("nextPart" BETWEEN 0 AND 5), "partDigests" TEXT[] NOT NULL DEFAULT '{}', "data" BYTEA NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3), "result" JSONB,
 CONSTRAINT "UploadTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "UploadTransfer_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "UploadTransfer_parts_check" CHECK ("nextPart" = cardinality("partDigests")),
 CONSTRAINT "UploadTransfer_data_check" CHECK (octet_length("data") <= "totalSize")
);
CREATE UNIQUE INDEX "UploadTransfer_companyId_actorId_requestKey_key" ON "UploadTransfer"("companyId","actorId","requestKey");
CREATE INDEX "UploadTransfer_expiresAt_idx" ON "UploadTransfer"("expiresAt");
