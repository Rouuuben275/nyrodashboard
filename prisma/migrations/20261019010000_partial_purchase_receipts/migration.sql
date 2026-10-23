ALTER TABLE "PurchaseItem" ADD COLUMN "receivedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_receivedQuantity_check" CHECK ("receivedQuantity" BETWEEN 0 AND "quantity");
CREATE UNIQUE INDEX "PurchaseItem_companyId_id_key" ON "PurchaseItem"("companyId","id");
CREATE TABLE "PurchaseReceipt" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "reference" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '', "occurredAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actorId" TEXT NOT NULL, "total" INTEGER NOT NULL,
 CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY("id"),
 CONSTRAINT "PurchaseReceipt_total_check" CHECK ("total" >= 0),
 CONSTRAINT "PurchaseReceipt_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "PurchaseReceipt_order_fkey" FOREIGN KEY("companyId","orderId") REFERENCES "PurchaseOrder"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseReceipt_companyId_id_key" ON "PurchaseReceipt"("companyId","id");
CREATE UNIQUE INDEX "PurchaseReceipt_companyId_requestKey_key" ON "PurchaseReceipt"("companyId","requestKey");
CREATE INDEX "PurchaseReceipt_companyId_orderId_createdAt_idx" ON "PurchaseReceipt"("companyId","orderId","createdAt");
CREATE TABLE "PurchaseReceiptLine" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "receiptId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL, "unitCost" INTEGER NOT NULL,
 CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY("id"),
 CONSTRAINT "PurchaseReceiptLine_quantity_check" CHECK ("quantity" > 0 AND "unitCost" >= 0),
 CONSTRAINT "PurchaseReceiptLine_receipt_fkey" FOREIGN KEY("companyId","receiptId") REFERENCES "PurchaseReceipt"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "PurchaseReceiptLine_item_fkey" FOREIGN KEY("companyId","itemId") REFERENCES "PurchaseItem"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "PurchaseReceiptLine_receiptId_itemId_key" ON "PurchaseReceiptLine"("receiptId","itemId");
