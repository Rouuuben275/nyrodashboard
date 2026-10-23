ALTER TABLE "Document" ADD COLUMN "folderId" TEXT,
  ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'TEAM',
  ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "Document_audience_check" CHECK ("audience" IN ('TEAM','MANAGERS'));
CREATE UNIQUE INDEX "Document_companyId_id_key" ON "Document"("companyId","id");
CREATE INDEX "Document_companyId_archived_updatedAt_idx" ON "Document"("companyId","archived","updatedAt");
CREATE TABLE "DocumentFolder" (
  "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0, "archived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "DocumentFolder_companyId_id_key" ON "DocumentFolder"("companyId","id");
CREATE UNIQUE INDEX "DocumentFolder_companyId_name_key" ON "DocumentFolder"("companyId","name");
ALTER TABLE "Document" ADD CONSTRAINT "Document_folder_fkey" FOREIGN KEY ("companyId","folderId") REFERENCES "DocumentFolder"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE TABLE "DocumentVersion" (
  "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "number" INTEGER NOT NULL, "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL, "digest" TEXT NOT NULL, "data" BYTEA NOT NULL,
  "authorId" TEXT NOT NULL, "authorName" TEXT NOT NULL, "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentVersion_size_check" CHECK ("size" BETWEEN 1 AND 5242880 AND octet_length("data")="size"),
  CONSTRAINT "DocumentVersion_number_check" CHECK ("number" BETWEEN 1 AND 50),
  CONSTRAINT "DocumentVersion_type_check" CHECK ("mimeType" IN ('application/pdf','image/png','image/jpeg','text/plain')),
  FOREIGN KEY ("companyId","documentId") REFERENCES "Document"("companyId","id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "DocumentVersion_documentId_number_key" ON "DocumentVersion"("documentId","number");
CREATE INDEX "DocumentVersion_companyId_documentId_createdAt_idx" ON "DocumentVersion"("companyId","documentId","createdAt");
CREATE TABLE "DocumentEvent" (
  "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL, "action" TEXT NOT NULL, "details" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("companyId","documentId") REFERENCES "Document"("companyId","id") ON DELETE CASCADE
);
CREATE INDEX "DocumentEvent_companyId_documentId_createdAt_idx" ON "DocumentEvent"("companyId","documentId","createdAt");
CREATE TABLE "DocumentCommand" (
  "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL, "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "DocumentCommand_companyId_requestKey_key" ON "DocumentCommand"("companyId","requestKey");
