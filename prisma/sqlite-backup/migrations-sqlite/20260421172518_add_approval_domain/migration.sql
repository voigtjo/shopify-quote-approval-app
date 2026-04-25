-- CreateTable
CREATE TABLE "ShopInstallation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "appName" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApprovalCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopInstallationId" TEXT NOT NULL,
    "externalReference" TEXT,
    "title" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalCase_shopInstallationId_fkey" FOREIGN KEY ("shopInstallationId") REFERENCES "ShopInstallation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "approvalCaseId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "summary" TEXT,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalRevision_approvalCaseId_fkey" FOREIGN KEY ("approvalCaseId") REFERENCES "ApprovalCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "approvalCaseId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalAction_approvalCaseId_fkey" FOREIGN KEY ("approvalCaseId") REFERENCES "ApprovalCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopInstallation_shopDomain_key" ON "ShopInstallation"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRevision_approvalCaseId_revisionNumber_key" ON "ApprovalRevision"("approvalCaseId", "revisionNumber");
