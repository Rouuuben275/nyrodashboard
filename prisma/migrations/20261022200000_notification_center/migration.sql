ALTER TABLE "User" ADD COLUMN "notificationMutedCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Notification" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL', ADD COLUMN "targetUrl" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_category_check" CHECK ("category" IN ('GENERAL','PLANNING','LEAVES','HR','PAYROLL','RECRUITMENT','TASKS','ANNOUNCEMENTS','CALENDAR','COMMUNITY'));
ALTER TABLE "User" ADD CONSTRAINT "User_notification_categories_check" CHECK ("notificationMutedCategories" <@ ARRAY['GENERAL','PLANNING','LEAVES','HR','PAYROLL','RECRUITMENT','TASKS','ANNOUNCEMENTS','CALENDAR','COMMUNITY']::TEXT[]);
CREATE INDEX "Notification_userId_category_createdAt_idx" ON "Notification"("userId","category","createdAt");
