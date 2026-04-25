const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const SHOP_DOMAIN =
  process.env.SEED_SHOP_DOMAIN || "voigt-approval-core.myshopify.com";

function ts(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000);
}

async function deleteExistingCasesForShop(shopInstallationId) {
  const existingCases = await prisma.approvalCase.findMany({
    where: { shopInstallationId },
    select: { id: true },
  });

  const caseIds = existingCases.map((item) => item.id);

  if (caseIds.length === 0) {
    return;
  }

  await prisma.approvalAction.deleteMany({
    where: { approvalCaseId: { in: caseIds } },
  });

  await prisma.approvalRevision.deleteMany({
    where: { approvalCaseId: { in: caseIds } },
  });

  await prisma.approvalCase.deleteMany({
    where: { id: { in: caseIds } },
  });
}

async function createDraftCase(shopInstallationId) {
  return prisma.approvalCase.create({
    data: {
      shopInstallationId,
      externalReference: "DEMO-1001",
      title: "Demo Draft Quote",
      customerName: "Anna Buyer",
      customerEmail: "anna@example.com",
      status: "DRAFT",
      currencyCode: "USD",
      revisions: {
        create: [
          {
            revisionNumber: 1,
            summary: "Initial draft created by merchant",
            payloadJson: JSON.stringify({
              title: "Demo Draft Quote",
              createdFrom: "seed",
            }),
            createdAt: ts(120),
          },
        ],
      },
      actions: {
        create: [
          {
            actorType: "MERCHANT",
            actionType: "CREATE_CASE",
            note: "Seeded draft case",
            createdAt: ts(120),
          },
        ],
      },
    },
  });
}

async function createInReviewCase(shopInstallationId) {
  return prisma.approvalCase.create({
    data: {
      shopInstallationId,
      externalReference: "DEMO-1002",
      title: "Demo In Review Quote",
      customerName: "Max Example",
      customerEmail: "max@example.com",
      status: "SENT_FOR_REVIEW",
      currencyCode: "USD",
      revisions: {
        create: [
          {
            revisionNumber: 1,
            summary: "Initial quote for review",
            payloadJson: JSON.stringify({
              title: "Demo In Review Quote",
              createdFrom: "seed",
            }),
            createdAt: ts(100),
          },
          {
            revisionNumber: 2,
            summary: "Updated delivery note before review",
            payloadJson: JSON.stringify({
              title: "Demo In Review Quote",
              createdFrom: "seed-revision",
            }),
            createdAt: ts(90),
          },
        ],
      },
      actions: {
        create: [
          {
            actorType: "MERCHANT",
            actionType: "CREATE_CASE",
            note: "Seeded in-review case",
            createdAt: ts(100),
          },
          {
            actorType: "MERCHANT",
            actionType: "ADD_REVISION",
            note: "Revision 2 added during seeding",
            createdAt: ts(90),
          },
          {
            actorType: "MERCHANT",
            actionType: "SEND_FOR_REVIEW",
            note: "Seeded case sent for review",
            createdAt: ts(80),
          },
        ],
      },
    },
  });
}

async function createChangesRequestedCase(shopInstallationId) {
  return prisma.approvalCase.create({
    data: {
      shopInstallationId,
      externalReference: "DEMO-1003",
      title: "Demo Changes Requested Quote",
      customerName: "Julia Customer",
      customerEmail: "julia@example.com",
      status: "CHANGES_REQUESTED",
      currencyCode: "USD",
      revisions: {
        create: [
          {
            revisionNumber: 1,
            summary: "Initial quote drafted",
            payloadJson: JSON.stringify({
              title: "Demo Changes Requested Quote",
              createdFrom: "seed",
            }),
            createdAt: ts(70),
          },
          {
            revisionNumber: 2,
            summary: "Clarified delivery timeline",
            payloadJson: JSON.stringify({
              title: "Demo Changes Requested Quote",
              createdFrom: "seed-revision",
            }),
            createdAt: ts(60),
          },
        ],
      },
      actions: {
        create: [
          {
            actorType: "MERCHANT",
            actionType: "CREATE_CASE",
            note: "Seeded changes-requested case",
            createdAt: ts(70),
          },
          {
            actorType: "MERCHANT",
            actionType: "ADD_REVISION",
            note: "Revision 2 added during seeding",
            createdAt: ts(60),
          },
          {
            actorType: "MERCHANT",
            actionType: "SEND_FOR_REVIEW",
            note: "Seeded case sent for review",
            createdAt: ts(50),
          },
          {
            actorType: "MERCHANT",
            actionType: "REQUEST_CHANGES",
            note: "Seeded case moved to changes requested",
            createdAt: ts(40),
          },
        ],
      },
    },
  });
}

async function createApprovedCase(shopInstallationId) {
  return prisma.approvalCase.create({
    data: {
      shopInstallationId,
      externalReference: "DEMO-1004",
      title: "Demo Approved Quote",
      customerName: "Peter Prospect",
      customerEmail: "peter@example.com",
      status: "APPROVED",
      currencyCode: "USD",
      revisions: {
        create: [
          {
            revisionNumber: 1,
            summary: "Initial approved quote",
            payloadJson: JSON.stringify({
              title: "Demo Approved Quote",
              createdFrom: "seed",
            }),
            createdAt: ts(30),
          },
        ],
      },
      actions: {
        create: [
          {
            actorType: "MERCHANT",
            actionType: "CREATE_CASE",
            note: "Seeded approved case",
            createdAt: ts(30),
          },
          {
            actorType: "MERCHANT",
            actionType: "SEND_FOR_REVIEW",
            note: "Seeded case sent for review",
            createdAt: ts(25),
          },
          {
            actorType: "MERCHANT",
            actionType: "APPROVE",
            note: "Seeded case approved",
            createdAt: ts(20),
          },
        ],
      },
    },
  });
}

async function main() {
  const shopInstallation = await prisma.shopInstallation.upsert({
    where: { shopDomain: SHOP_DOMAIN },
    update: {},
    create: {
      shopDomain: SHOP_DOMAIN,
      appName: "Quote Approval App",
    },
  });

  await deleteExistingCasesForShop(shopInstallation.id);

  await createDraftCase(shopInstallation.id);
  await createInReviewCase(shopInstallation.id);
  await createChangesRequestedCase(shopInstallation.id);
  await createApprovedCase(shopInstallation.id);

  console.log(`Seed completed for ${SHOP_DOMAIN}`);
  console.log("Created demo cases:");
  console.log("- Demo Draft Quote");
  console.log("- Demo In Review Quote");
  console.log("- Demo Changes Requested Quote");
  console.log("- Demo Approved Quote");
}

main()
  .catch((error) => {
    console.error("Seed failed");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });