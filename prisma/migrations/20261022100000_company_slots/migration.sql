CREATE TABLE "CompanySlotAccount" (
  "discordId" TEXT NOT NULL PRIMARY KEY,
  "granted" INTEGER NOT NULL DEFAULT 0 CHECK ("granted" >= 0),
  "purchased" INTEGER NOT NULL DEFAULT 0 CHECK ("purchased" >= 0),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "CompanySlotPurchase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "discordId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "mode" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 500 CHECK ("amount" = 500),
  "currency" TEXT NOT NULL DEFAULT 'eur' CHECK ("currency" = 'eur'),
  "sessionId" TEXT,
  "checkoutUrl" TEXT,
  "paymentIntentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "CompanySlotPurchase_requestKey_key" ON "CompanySlotPurchase"("requestKey");
CREATE UNIQUE INDEX "CompanySlotPurchase_sessionId_key" ON "CompanySlotPurchase"("sessionId");
CREATE UNIQUE INDEX "CompanySlotPurchase_paymentIntentId_key" ON "CompanySlotPurchase"("paymentIntentId");
CREATE INDEX "CompanySlotPurchase_discordId_createdAt_id_idx" ON "CompanySlotPurchase"("discordId","createdAt","id");
CREATE TABLE "CompanySlotPaymentEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CompanySlotPaymentEvent_purchaseId_createdAt_idx" ON "CompanySlotPaymentEvent"("purchaseId","createdAt");
