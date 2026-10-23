ALTER TABLE "Sale" ADD COLUMN "discountBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'SALES',
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD CONSTRAINT "Sale_discount_check" CHECK ("discountBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Sale_channel_check" CHECK ("channel" IN ('SALES','CASH'));
CREATE INDEX "Sale_companyId_sellerId_createdAt_idx" ON "Sale"("companyId","sellerId","createdAt");
