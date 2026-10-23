-- CreateTable
CREATE TABLE "ServerAuditLog" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerAuditLog_serverId_createdAt_idx" ON "ServerAuditLog"("serverId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServerAuditLog" ADD CONSTRAINT "ServerAuditLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "RPServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
