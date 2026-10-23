-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "publishedBy" TEXT,
    "publisherName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementCommand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "AnnouncementCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_companyId_status_startsAt_idx" ON "Announcement"("companyId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Announcement_companyId_department_status_idx" ON "Announcement"("companyId", "department", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_companyId_id_key" ON "Announcement"("companyId", "id");

-- CreateIndex
CREATE INDEX "AnnouncementRead_companyId_announcementId_readAt_idx" ON "AnnouncementRead"("companyId", "announcementId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_companyId_announcementId_memberId_key" ON "AnnouncementRead"("companyId", "announcementId", "memberId");

-- CreateIndex
CREATE INDEX "AnnouncementEvent_companyId_announcementId_createdAt_idx" ON "AnnouncementEvent"("companyId", "announcementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementCommand_companyId_requestKey_key" ON "AnnouncementCommand"("companyId", "requestKey");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_companyId_announcementId_fkey" FOREIGN KEY ("companyId", "announcementId") REFERENCES "Announcement"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_companyId_memberId_fkey" FOREIGN KEY ("companyId", "memberId") REFERENCES "CompanyMember"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AnnouncementEvent" ADD CONSTRAINT "AnnouncementEvent_companyId_announcementId_fkey" FOREIGN KEY ("companyId", "announcementId") REFERENCES "Announcement"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementCommand" ADD CONSTRAINT "AnnouncementCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
