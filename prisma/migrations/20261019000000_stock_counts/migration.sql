ALTER TABLE "Product" ADD COLUMN "stockRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "StockBatch" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT', "label" TEXT NOT NULL, "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "postedAt" TIMESTAMP(3), "decidedBy" TEXT, "revision" INTEGER NOT NULL DEFAULT 0, "reason" TEXT NOT NULL DEFAULT '',
 CONSTRAINT "StockBatch_pkey" PRIMARY KEY("id"),
 CONSTRAINT "StockBatch_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockBatch_companyId_id_key" ON "StockBatch"("companyId","id");
CREATE UNIQUE INDEX "StockBatch_companyId_requestKey_key" ON "StockBatch"("companyId","requestKey");
CREATE INDEX "StockBatch_companyId_createdAt_idx" ON "StockBatch"("companyId","createdAt");
CREATE TABLE "StockCountLine" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "batchId" TEXT NOT NULL, "productId" TEXT NOT NULL, "name" TEXT NOT NULL, "sku" TEXT NOT NULL,
 "expected" INTEGER NOT NULL, "stockRevision" INTEGER NOT NULL, "counted" INTEGER, "reason" TEXT NOT NULL DEFAULT '',
 CONSTRAINT "StockCountLine_pkey" PRIMARY KEY("id"),
 CONSTRAINT "StockCountLine_quantity_check" CHECK("expected" BETWEEN 0 AND 1000000 AND ("counted" IS NULL OR "counted" BETWEEN 0 AND 1000000)),
 CONSTRAINT "StockCountLine_batch_fkey" FOREIGN KEY("companyId","batchId") REFERENCES "StockBatch"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "StockCountLine_product_fkey" FOREIGN KEY("companyId","productId") REFERENCES "Product"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "StockCountLine_batchId_productId_key" ON "StockCountLine"("batchId","productId");
ALTER TABLE "InventoryMovement" ADD COLUMN "kind" TEXT, ADD COLUMN "occurredAt" TIMESTAMP(3), ADD COLUMN "unitCost" INTEGER, ADD COLUMN "sourceId" TEXT, ADD COLUMN "batchId" TEXT, ADD COLUMN "reversalOfId" TEXT;
CREATE UNIQUE INDEX "InventoryMovement_companyId_id_key" ON "InventoryMovement"("companyId","id");
CREATE UNIQUE INDEX "InventoryMovement_companyId_reversalOfId_key" ON "InventoryMovement"("companyId","reversalOfId");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_batch_fkey" FOREIGN KEY("companyId","batchId") REFERENCES "StockBatch"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_reversal_fkey" FOREIGN KEY("companyId","reversalOfId") REFERENCES "InventoryMovement"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
