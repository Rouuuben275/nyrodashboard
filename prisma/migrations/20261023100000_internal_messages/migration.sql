CREATE TABLE "ChatThread" (
 "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "title" TEXT NOT NULL, "ownerMemberId" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0,
 "lastSequence" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChatThread_kind_check" CHECK ("kind" IN ('PRIVATE','GROUP')),
 CONSTRAINT "ChatThread_sequence_check" CHECK ("lastSequence" >= 0),
 CONSTRAINT "ChatThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChatThread_companyId_id_key" ON "ChatThread"("companyId","id");
CREATE INDEX "ChatThread_companyId_updatedAt_id_idx" ON "ChatThread"("companyId","updatedAt","id");
CREATE TABLE "ChatParticipant" (
 "companyId" TEXT NOT NULL, "threadId" TEXT NOT NULL, "memberId" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "archived" BOOLEAN NOT NULL DEFAULT false,
 "lastReadSequence" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("threadId","memberId"),
 CONSTRAINT "ChatParticipant_read_check" CHECK ("lastReadSequence" >= 0),
 CONSTRAINT "ChatParticipant_thread_fkey" FOREIGN KEY ("companyId","threadId") REFERENCES "ChatThread"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ChatParticipant_member_fkey" FOREIGN KEY ("companyId","memberId") REFERENCES "CompanyMember"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChatParticipant_companyId_memberId_active_archived_idx" ON "ChatParticipant"("companyId","memberId","active","archived");
CREATE TABLE "ChatMessage" (
 "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "threadId" TEXT NOT NULL,
 "sequence" INTEGER NOT NULL, "senderMemberId" TEXT NOT NULL, "senderName" TEXT NOT NULL,
 "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChatMessage_body_check" CHECK (length(btrim("body")) BETWEEN 1 AND 4000),
 CONSTRAINT "ChatMessage_sequence_check" CHECK ("sequence" > 0),
 CONSTRAINT "ChatMessage_thread_fkey" FOREIGN KEY ("companyId","threadId") REFERENCES "ChatThread"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChatMessage_threadId_sequence_key" ON "ChatMessage"("threadId","sequence");
CREATE INDEX "ChatMessage_companyId_threadId_createdAt_idx" ON "ChatMessage"("companyId","threadId","createdAt");
CREATE TABLE "ChatCommand" (
 "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "result" JSONB NOT NULL,
 CONSTRAINT "ChatCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChatCommand_companyId_requestKey_key" ON "ChatCommand"("companyId","requestKey");
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_category_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_category_check" CHECK ("category" IN ('GENERAL','PLANNING','LEAVES','HR','PAYROLL','RECRUITMENT','TASKS','ANNOUNCEMENTS','CALENDAR','COMMUNITY','MESSAGES'));
ALTER TABLE "User" DROP CONSTRAINT "User_notification_categories_check";
ALTER TABLE "User" ADD CONSTRAINT "User_notification_categories_check" CHECK ("notificationMutedCategories" <@ ARRAY['GENERAL','PLANNING','LEAVES','HR','PAYROLL','RECRUITMENT','TASKS','ANNOUNCEMENTS','CALENDAR','COMMUNITY','MESSAGES']::TEXT[]);
