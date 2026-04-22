import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type ActionErrors = {
  title?: string;
  customerEmail?: string;
};

type ActionData = {
  errors?: ActionErrors;
  values?: {
    title: string;
    customerName: string;
    customerEmail: string;
  };
};

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

  const formData = await request.formData();

  const title = String(formData.get("title") || "").trim();
  const customerName = String(formData.get("customerName") || "").trim();
  const customerEmail = String(formData.get("customerEmail") || "").trim();

  const errors: ActionErrors = {};

  if (!title) {
    errors.title = "Title is required.";
  }

  if (customerEmail && !customerEmail.includes("@")) {
    errors.customerEmail = "Customer email must look like an email address.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      values: {
        title,
        customerName,
        customerEmail,
      },
    } satisfies ActionData;
  }

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
      externalReference: `CASE-${existingCount + 1}`,
      title,
      customerName: customerName || null,
      customerEmail: customerEmail || null,
      currencyCode: "USD",
      revisions: {
        create: {
          revisionNumber: 1,
          summary: "Initial merchant-created revision",
          payloadJson: JSON.stringify({
            title,
            customerName,
            customerEmail,
            createdFrom: "dashboard-form",
          }),
        },
      },
      actions: {
        create: {
          actorType: "MERCHANT",
          actionType: "CREATE_CASE",
          note: "Approval case created from dashboard form",
        },
      },
    },
  });

  return redirect("/app");
};

export default function Index() {
  const { shopDomain, approvalCases } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Quote Approval Dashboard">
      <s-section heading="Shop context">
        <s-paragraph>
          Connected shop: <strong>{shopDomain}</strong>
        </s-paragraph>
      </s-section>

      <s-section heading="Create approval case">
        <Form method="post">
          <div
            style={{
              display: "grid",
              gap: "12px",
              maxWidth: "640px",
            }}
          >
            <div>
              <label htmlFor="title" style={{ display: "block", fontWeight: 600 }}>
                Title
              </label>
              <input
                id="title"
                name="title"
                type="text"
                defaultValue={actionData?.values?.title ?? ""}
                style={{ width: "100%", padding: "8px" }}
              />
              {actionData?.errors?.title ? (
                <p style={{ color: "crimson", marginTop: "4px" }}>
                  {actionData.errors.title}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="customerName"
                style={{ display: "block", fontWeight: 600 }}
              >
                Customer name
              </label>
              <input
                id="customerName"
                name="customerName"
                type="text"
                defaultValue={actionData?.values?.customerName ?? ""}
                style={{ width: "100%", padding: "8px" }}
              />
            </div>

            <div>
              <label
                htmlFor="customerEmail"
                style={{ display: "block", fontWeight: 600 }}
              >
                Customer email
              </label>
              <input
                id="customerEmail"
                name="customerEmail"
                type="email"
                defaultValue={actionData?.values?.customerEmail ?? ""}
                style={{ width: "100%", padding: "8px" }}
              />
              {actionData?.errors?.customerEmail ? (
                <p style={{ color: "crimson", marginTop: "4px" }}>
                  {actionData.errors.customerEmail}
                </p>
              ) : null}
            </div>

            <div>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create approval case"}
              </button>
            </div>
          </div>
        </Form>
      </s-section>

      <s-section heading="Approval cases">
        {approvalCases.length === 0 ? (
          <s-paragraph>
            No approval cases exist yet. Create the first one using the form
            above.
          </s-paragraph>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
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

                <div style={{ marginTop: "12px" }}>
                  <Link to={`/app/cases/${approvalCase.id}`}>Open case</Link>
                </div>
              </s-box>
            ))}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};