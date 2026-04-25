-- CreateEnum
CREATE TYPE "ApprovalCaseStatus" AS ENUM ('DRAFT', 'SENT_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'DRAFT_ORDER_CREATED', 'INVOICE_SENT', 'CONVERTED_TO_ORDER');

-- CreateEnum
CREATE TYPE "ApprovalActorType" AS ENUM ('MERCHANT', 'CUSTOMER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('CREATE_CASE', 'ADD_REVISION', 'SEND_FOR_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'REJECT', 'EXPIRE', 'PREPARE_HANDOFF', 'CREATE_DRAFT_ORDER', 'SEND_INVOICE');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopInstallation" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "appName" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalCase" (
    "id" TEXT NOT NULL,
    "shopInstallationId" TEXT NOT NULL,
    "externalReference" TEXT,
    "title" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "status" "ApprovalCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "expiresAt" TIMESTAMP(3),
    "shopifyDraftOrderId" TEXT,
    "shopifyDraftOrderName" TEXT,
    "shopifyInvoiceUrl" TEXT,
    "handoffPreparedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRevision" (
    "id" TEXT NOT NULL,
    "approvalCaseId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "summary" TEXT,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL,
    "approvalCaseId" TEXT NOT NULL,
    "actorType" "ApprovalActorType" NOT NULL,
    "actionType" "ApprovalActionType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopInstallation_shopDomain_key" ON "ShopInstallation"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalCase_shopifyDraftOrderId_key" ON "ApprovalCase"("shopifyDraftOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRevision_approvalCaseId_revisionNumber_key" ON "ApprovalRevision"("approvalCaseId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "ApprovalCase" ADD CONSTRAINT "ApprovalCase_shopInstallationId_fkey" FOREIGN KEY ("shopInstallationId") REFERENCES "ShopInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRevision" ADD CONSTRAINT "ApprovalRevision_approvalCaseId_fkey" FOREIGN KEY ("approvalCaseId") REFERENCES "ApprovalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_approvalCaseId_fkey" FOREIGN KEY ("approvalCaseId") REFERENCES "ApprovalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
