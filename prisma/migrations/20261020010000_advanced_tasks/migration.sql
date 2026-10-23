-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "TaskStatus" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskChecklistItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCommand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "TaskCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskStatus_companyId_archived_position_idx" ON "TaskStatus"("companyId", "archived", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStatus_companyId_name_key" ON "TaskStatus"("companyId", "name");

-- CreateIndex
CREATE INDEX "TaskChecklistItem_companyId_taskId_position_idx" ON "TaskChecklistItem"("companyId", "taskId", "position");

-- CreateIndex
CREATE INDEX "TaskComment_companyId_taskId_createdAt_idx" ON "TaskComment"("companyId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskEvent_companyId_taskId_createdAt_idx" ON "TaskEvent"("companyId", "taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCommand_companyId_requestKey_key" ON "TaskCommand"("companyId", "requestKey");

-- CreateIndex
CREATE INDEX "Task_companyId_archived_status_dueAt_idx" ON "Task"("companyId", "archived", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_companyId_assigneeId_archived_idx" ON "Task"("companyId", "assigneeId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Task_companyId_id_key" ON "Task"("companyId", "id");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_assigneeId_fkey" FOREIGN KEY ("companyId", "assigneeId") REFERENCES "CompanyMember"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "TaskStatus" ADD CONSTRAINT "TaskStatus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_companyId_taskId_fkey" FOREIGN KEY ("companyId", "taskId") REFERENCES "Task"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_companyId_taskId_fkey" FOREIGN KEY ("companyId", "taskId") REFERENCES "Task"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_companyId_taskId_fkey" FOREIGN KEY ("companyId", "taskId") REFERENCES "Task"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommand" ADD CONSTRAINT "TaskCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
