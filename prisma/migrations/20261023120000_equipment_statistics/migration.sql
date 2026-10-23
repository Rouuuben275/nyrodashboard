CREATE TABLE "EquipmentItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "code" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "name" TEXT NOT NULL, "registration" TEXT NOT NULL DEFAULT '', "serial" TEXT NOT NULL DEFAULT '',
 "location" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '', "state" TEXT NOT NULL DEFAULT 'READY',
 "mileage" INTEGER, "acquiredOn" TEXT, "nextServiceOn" TEXT, "custodianId" TEXT,
 "revision" INTEGER NOT NULL DEFAULT 0, "archived" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "EquipmentItem_kind_check" CHECK ("kind" IN ('VEHICLE','EQUIPMENT')),
 CONSTRAINT "EquipmentItem_state_check" CHECK ("state" IN ('READY','MAINTENANCE','OUT_OF_SERVICE')),
 CONSTRAINT "EquipmentItem_mileage_check" CHECK ("mileage" IS NULL OR ("kind"='VEHICLE' AND "mileage">=0)),
 CONSTRAINT "EquipmentItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "EquipmentItem_companyId_custodianId_fkey" FOREIGN KEY ("companyId","custodianId") REFERENCES "CompanyMember"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "EquipmentItem_companyId_id_key" ON "EquipmentItem"("companyId","id");
CREATE UNIQUE INDEX "EquipmentItem_companyId_code_key" ON "EquipmentItem"("companyId","code");
CREATE UNIQUE INDEX "EquipmentItem_registration_unique" ON "EquipmentItem"("companyId","registration") WHERE "kind"='VEHICLE' AND "registration"<>'';
CREATE INDEX "EquipmentItem_companyId_archived_state_idx" ON "EquipmentItem"("companyId","archived","state");
CREATE INDEX "EquipmentItem_companyId_custodianId_idx" ON "EquipmentItem"("companyId","custodianId");
CREATE TABLE "EquipmentWork" (
 "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "title" TEXT NOT NULL, "details" TEXT NOT NULL, "blocking" BOOLEAN NOT NULL DEFAULT true, "dueOn" TEXT,
 "status" TEXT NOT NULL DEFAULT 'OPEN', "resolution" TEXT, "authorName" TEXT NOT NULL, "closedBy" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3),
 CONSTRAINT "EquipmentWork_kind_check" CHECK ("kind" IN ('MAINTENANCE','INCIDENT')),
 CONSTRAINT "EquipmentWork_status_check" CHECK ("status" IN ('OPEN','CLOSED')),
 CONSTRAINT "EquipmentWork_closed_check" CHECK (("status"='OPEN' AND "closedAt" IS NULL) OR ("status"='CLOSED' AND "closedAt" IS NOT NULL AND "resolution" IS NOT NULL)),
 CONSTRAINT "EquipmentWork_companyId_itemId_fkey" FOREIGN KEY ("companyId","itemId") REFERENCES "EquipmentItem"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EquipmentWork_companyId_itemId_status_createdAt_idx" ON "EquipmentWork"("companyId","itemId","status","createdAt");
CREATE TABLE "EquipmentEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "action" TEXT NOT NULL,
 "actorName" TEXT NOT NULL, "reason" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EquipmentEvent_companyId_itemId_fkey" FOREIGN KEY ("companyId","itemId") REFERENCES "EquipmentItem"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EquipmentEvent_companyId_itemId_createdAt_idx" ON "EquipmentEvent"("companyId","itemId","createdAt");
CREATE TABLE "UtilityCommand" (
 "id" TEXT NOT NULL PRIMARY KEY, "companyId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "result" JSONB NOT NULL,
 CONSTRAINT "UtilityCommand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UtilityCommand_companyId_requestKey_key" ON "UtilityCommand"("companyId","requestKey");
CREATE TABLE "StatisticsLayout" (
 "companyId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "widgets" TEXT[] NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "StatisticsLayout_pkey" PRIMARY KEY ("companyId","memberId"),
 CONSTRAINT "StatisticsLayout_widgets_check" CHECK ("widgets" <@ ARRAY['finance','sales','people','stock','orders']::TEXT[]),
 CONSTRAINT "StatisticsLayout_companyId_memberId_fkey" FOREIGN KEY ("companyId","memberId") REFERENCES "CompanyMember"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_category_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_category_check" CHECK ("category" IN ('GENERAL','PLANNING','LEAVES','HR','PAYROLL','RECRUITMENT','TASKS','ANNOUNCEMENTS','CALENDAR','COMMUNITY','MESSAGES','EQUIPMENT'));
ALTER TABLE "User" DROP CONSTRAINT "User_notification_categories_check";
ALTER TABLE "User" ADD CONSTRAINT "User_notification_categories_check" CHECK ("notificationMutedCategories" <@ ARRAY['GENERAL','PLANNING','LEAVES','HR','PAYROLL','RECRUITMENT','TASKS','ANNOUNCEMENTS','CALENDAR','COMMUNITY','MESSAGES','EQUIPMENT']::TEXT[]);
