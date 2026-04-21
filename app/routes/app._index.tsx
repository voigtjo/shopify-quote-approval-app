import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopInstallation = await db.shopInstallation.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: {
      shopDomain: session.shop,
      appName: "Quote Approval App",
    },
  });

  const approvalCases = await db.approvalCase.findMany({
    where: { shopInstallationId: shopInstallation.id },
    orderBy: { updatedAt: "desc" },
    include: {
      revisions: {
        orderBy: { revisionNumber: "desc" },
        take: 1,
      },
      actions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return {
    shopDomain: session.shop,
    approvalCases,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopInstallation = await db.shopInstallation.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: {
      shopDomain: session.shop,
      appName: "Quote Approval App",
    },
  });

  const existingCount = await db.approvalCase.count({
    where: { shopInstallationId: shopInstallation.id },
  });

  await db.approvalCase.create({
    data: {
      shopInstallationId: shopInstallation.id,
      externalReference: `TEST-${existingCount + 1}`,
      title: `Test approval case ${existingCount + 1}`,
      customerName: "Max Example",
      customerEmail: "max@example.com",
      currencyCode: "USD",
      revisions: {
        create: {
          revisionNumber: 1,
          summary: "Initial test revision",
          payloadJson: JSON.stringify({
            source: "manual test creation",
            createdFrom: "dashboard",
          }),
        },
      },
      actions: {
        create: {
          actorType: "MERCHANT",
          actionType: "CREATE_CASE",
          note: "Initial test case created from dashboard",
        },
      },
    },
  });

  return redirect("/app");
};

export default function Index() {
  const { shopDomain, approvalCases } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Quote Approval Dashboard">
      <s-section heading="Shop context">
        <s-paragraph>
          Connected shop: <strong>{shopDomain}</strong>
        </s-paragraph>
      </s-section>

      <s-section heading="Quick action">
        <Form method="post">
          <button type="submit">Create test approval case</button>
        </Form>
      </s-section>

      <s-section heading="Approval cases">
        {approvalCases.length === 0 ? (
          <s-paragraph>
            No approval cases exist yet. Create the first one using the button
            above.
          </s-paragraph>
        ) : (
          <s-box>
            {approvalCases.map((approvalCase) => (
              <s-box
                key={approvalCase.id}
                padding="base"
                border="base"
                borderRadius="large"
              >
                <s-heading>{approvalCase.title}</s-heading>
                <s-paragraph>Status: {approvalCase.status}</s-paragraph>
                <s-paragraph>
                  Customer: {approvalCase.customerName || "—"}
                </s-paragraph>
                <s-paragraph>
                  Email: {approvalCase.customerEmail || "—"}
                </s-paragraph>
                <s-paragraph>
                  Latest revision:{" "}
                  {approvalCase.revisions[0]?.revisionNumber ?? "—"}
                </s-paragraph>
                <s-paragraph>
                  Last action: {approvalCase.actions[0]?.actionType ?? "—"}
                </s-paragraph>
              </s-box>
            ))}
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};