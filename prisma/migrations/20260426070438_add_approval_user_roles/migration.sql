-- CreateEnum
CREATE TYPE "ApprovalRole" AS ENUM ('STAFF', 'APPROVER', 'OWNER');

-- CreateTable
CREATE TABLE "ApprovalUserRole" (
    "id" TEXT NOT NULL,
    "shopInstallationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "ApprovalRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalUserRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalUserRole_shopInstallationId_email_key" ON "ApprovalUserRole"("shopInstallationId", "email");

-- AddForeignKey
ALTER TABLE "ApprovalUserRole" ADD CONSTRAINT "ApprovalUserRole_shopInstallationId_fkey" FOREIGN KEY ("shopInstallationId") REFERENCES "ShopInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
