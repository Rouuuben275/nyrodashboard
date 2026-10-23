CREATE TABLE "StockWarehouse" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "archived" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StockWarehouse_pkey" PRIMARY KEY("id"),
 CONSTRAINT "StockWarehouse_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockWarehouse_companyId_id_key" ON "StockWarehouse"("companyId","id");
CREATE UNIQUE INDEX "StockWarehouse_companyId_code_key" ON "StockWarehouse"("companyId","code");
CREATE TABLE "WarehouseStock" (
 "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL, "productId" TEXT NOT NULL, "quantity" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "WarehouseStock_pkey" PRIMARY KEY("id"),
 CONSTRAINT "WarehouseStock_quantity_check" CHECK ("quantity" BETWEEN 0 AND 1000000),
 CONSTRAINT "WarehouseStock_warehouse_fkey" FOREIGN KEY("companyId","warehouseId") REFERENCES "StockWarehouse"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION,
 CONSTRAINT "WarehouseStock_product_fkey" FOREIGN KEY("companyId","productId") REFERENCES "Product"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "WarehouseStock_companyId_warehouseId_productId_key" ON "WarehouseStock"("companyId","warehouseId","productId");
CREATE INDEX "WarehouseStock_companyId_productId_idx" ON "WarehouseStock"("companyId","productId");
ALTER TABLE "InventoryMovement" ADD COLUMN "warehouseId" TEXT, ADD COLUMN "warehouseLabel" TEXT;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouse_fkey" FOREIGN KEY("companyId","warehouseId") REFERENCES "StockWarehouse"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "StockBatch" ADD COLUMN "sourceWarehouseId" TEXT, ADD COLUMN "destinationWarehouseId" TEXT, ADD COLUMN "sourceLabel" TEXT, ADD COLUMN "destinationLabel" TEXT;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_transfer_places_check" CHECK ("kind" <> 'TRANSFER' OR ("sourceWarehouseId" IS DISTINCT FROM "destinationWarehouseId"));
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_sourceWarehouse_fkey" FOREIGN KEY("companyId","sourceWarehouseId") REFERENCES "StockWarehouse"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_destinationWarehouse_fkey" FOREIGN KEY("companyId","destinationWarehouseId") REFERENCES "StockWarehouse"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE UNIQUE INDEX "InventoryMovement_transfer_pair_key" ON "InventoryMovement"("companyId","batchId","kind") WHERE "kind" IN ('TRANSFER_IN','TRANSFER_OUT');
