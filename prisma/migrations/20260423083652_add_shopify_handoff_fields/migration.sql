/*
  Warnings:

  - A unique constraint covering the columns `[shopifyDraftOrderId]` on the table `ApprovalCase` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ApprovalCase" ADD COLUMN "handoffPreparedAt" DATETIME;
ALTER TABLE "ApprovalCase" ADD COLUMN "shopifyDraftOrderId" TEXT;
ALTER TABLE "ApprovalCase" ADD COLUMN "shopifyDraftOrderName" TEXT;
ALTER TABLE "ApprovalCase" ADD COLUMN "shopifyInvoiceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalCase_shopifyDraftOrderId_key" ON "ApprovalCase"("shopifyDraftOrderId");
