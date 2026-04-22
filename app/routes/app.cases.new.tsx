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
  await authenticate.admin(request);
  return null;
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

  const newCase = await db.approvalCase.create({
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
            createdFrom: "new-case-page",
          }),
        },
      },
      actions: {
        create: {
          actorType: "MERCHANT",
          actionType: "CREATE_CASE",
          note: "Approval case created from new case page",
        },
      },
    },
  });

  return redirect(`/app/cases/${newCase.id}`);
};

export default function NewCasePage() {
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: "16px",
        background: "#FFFFFF",
        padding: "16px",
        display: "grid",
        gap: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: "18px",
            fontWeight: 700,
          }}
        >
          New approval case
        </div>

        <Link to="/app/cases">← Back to cases</Link>
      </div>

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
              style={{ width: "100%", padding: "10px" }}
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
              style={{ width: "100%", padding: "10px" }}
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
              style={{ width: "100%", padding: "10px" }}
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
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};