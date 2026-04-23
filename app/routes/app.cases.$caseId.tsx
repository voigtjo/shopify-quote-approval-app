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
  summary?: string;
  form?: string;
};

type ActionData = {
  errors?: ActionErrors;
  values?: {
    summary: string;
  };
};

type CaseStatus =
  | "DRAFT"
  | "SENT_FOR_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "DRAFT_ORDER_CREATED"
  | "INVOICE_SENT"
  | "CONVERTED_TO_ORDER";

type DraftOrderCreateResponse = {
  data?: {
    draftOrderCreate?: {
      draftOrder?: {
        id: string;
        name: string;
        invoiceUrl?: string | null;
      } | null;
      userErrors?: Array<{
        field?: string[] | null;
        message: string;
      }>;
    };
  };
};

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getNextStep(status: CaseStatus) {
  switch (status) {
    case "DRAFT":
      return "Review the case details, add revisions if needed, then send the case for review.";
    case "SENT_FOR_REVIEW":
      return "Choose one decision: approve, request changes, or reject the case.";
    case "CHANGES_REQUESTED":
      return "Update the case, add a revision that documents the change, then send it for review again.";
    case "APPROVED":
      return "Prepare the Shopify handoff. The next product step will be Draft Order creation.";
    case "REJECTED":
      return "This case is closed unless you create a replacement case or restart the flow later.";
    case "EXPIRED":
      return "Review whether the case should be reopened or replaced.";
    case "DRAFT_ORDER_CREATED":
      return "Open the draft order or invoice and continue in Shopify.";
    case "INVOICE_SENT":
      return "Wait for customer payment or follow up on the invoice.";
    case "CONVERTED_TO_ORDER":
      return "The approval flow is complete and the Shopify order now exists.";
    default:
      return "Review the case and decide on the next action.";
  }
}

function getRemainingSteps(status: CaseStatus) {
  switch (status) {
    case "DRAFT":
      return ["Optional revisions", "Send for review", "Decision", "Shopify handoff"];
    case "SENT_FOR_REVIEW":
      return ["Decision", "Shopify handoff"];
    case "CHANGES_REQUESTED":
      return ["Add revision", "Send for review again", "Decision", "Shopify handoff"];
    case "APPROVED":
      return ["Prepare Shopify handoff", "Create Draft Order"];
    case "REJECTED":
      return ["No required steps remaining"];
    case "EXPIRED":
      return ["Review whether the flow should continue"];
    case "DRAFT_ORDER_CREATED":
      return ["Send invoice or continue with order handling"];
    case "INVOICE_SENT":
      return ["Wait for payment / conversion to order"];
    case "CONVERTED_TO_ORDER":
      return ["No required steps remaining"];
    default:
      return ["Review the case"];
  }
}

function getStatusBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "DRAFT":
      return { background: "#F3F4F6", color: "#374151" };
    case "SENT_FOR_REVIEW":
      return { background: "#DBEAFE", color: "#1D4ED8" };
    case "CHANGES_REQUESTED":
      return { background: "#FEF3C7", color: "#92400E" };
    case "APPROVED":
      return { background: "#DCFCE7", color: "#166534" };
    case "REJECTED":
      return { background: "#FEE2E2", color: "#991B1B" };
    case "DRAFT_ORDER_CREATED":
      return { background: "#E0E7FF", color: "#3730A3" };
    case "INVOICE_SENT":
      return { background: "#FCE7F3", color: "#9D174D" };
    case "CONVERTED_TO_ORDER":
      return { background: "#D1FAE5", color: "#065F46" };
    default:
      return { background: "#F3F4F6", color: "#374151" };
  }
}

function getHandoffState(approvalCase: {
  handoffPreparedAt: string | Date | null;
  shopifyDraftOrderId: string | null;
  status: string;
}) {
  if (approvalCase.shopifyDraftOrderId) return "Draft order created";
  if (approvalCase.handoffPreparedAt) return "Ready";
  if (approvalCase.status === "APPROVED") return "Pending";
  return "Not started";
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const caseId = params.caseId;
  if (!caseId) {
    throw new Response("Case ID is required", { status: 400 });
  }

  const shopInstallation = await db.shopInstallation.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shopInstallation) {
    throw new Response("Shop installation not found", { status: 404 });
  }

  const approvalCase = await db.approvalCase.findFirst({
    where: {
      id: caseId,
      shopInstallationId: shopInstallation.id,
    },
    include: {
      revisions: {
        orderBy: { revisionNumber: "desc" },
      },
      actions: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!approvalCase) {
    throw new Response("Approval case not found", { status: 404 });
  }

  return {
    approvalCase,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const caseId = params.caseId;
  if (!caseId) {
    throw new Response("Case ID is required", { status: 400 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  const shopInstallation = await db.shopInstallation.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shopInstallation) {
    throw new Response("Shop installation not found", { status: 404 });
  }

  const approvalCase = await db.approvalCase.findFirst({
    where: {
      id: caseId,
      shopInstallationId: shopInstallation.id,
    },
    include: {
      revisions: {
        orderBy: { revisionNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!approvalCase) {
    throw new Response("Approval case not found", { status: 404 });
  }

  if (intent === "addRevision") {
    const summary = String(formData.get("summary") || "").trim();

    const errors: ActionErrors = {};

    if (!summary) {
      errors.summary = "Revision summary is required.";
    }

    if (
      approvalCase.status === "APPROVED" ||
      approvalCase.status === "REJECTED" ||
      approvalCase.status === "DRAFT_ORDER_CREATED" ||
      approvalCase.status === "INVOICE_SENT" ||
      approvalCase.status === "CONVERTED_TO_ORDER"
    ) {
      errors.form =
        "Revisions cannot be added after a case is completed or handed off.";
    }

    if (Object.keys(errors).length > 0) {
      return {
        errors,
        values: {
          summary,
        },
      } satisfies ActionData;
    }

    const nextRevisionNumber =
      (approvalCase.revisions[0]?.revisionNumber ?? 0) + 1;

    await db.$transaction([
      db.approvalRevision.create({
        data: {
          approvalCaseId: approvalCase.id,
          revisionNumber: nextRevisionNumber,
          summary,
          payloadJson: JSON.stringify({
            summary,
            createdFrom: "case-detail-form",
          }),
        },
      }),
      db.approvalAction.create({
        data: {
          approvalCaseId: approvalCase.id,
          actorType: "MERCHANT",
          actionType: "ADD_REVISION",
          note: `Revision ${nextRevisionNumber} added from case detail page`,
        },
      }),
    ]);

    return redirect(`/app/cases/${approvalCase.id}`);
  }

  if (intent === "sendForReview") {
    if (
      approvalCase.status !== "DRAFT" &&
      approvalCase.status !== "CHANGES_REQUESTED"
    ) {
      return {
        errors: {
          form: "Only draft cases or cases with requested changes can be sent for review.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    await db.$transaction([
      db.approvalCase.update({
        where: { id: approvalCase.id },
        data: {
          status: "SENT_FOR_REVIEW",
        },
      }),
      db.approvalAction.create({
        data: {
          approvalCaseId: approvalCase.id,
          actorType: "MERCHANT",
          actionType: "SEND_FOR_REVIEW",
          note:
            approvalCase.status === "CHANGES_REQUESTED"
              ? "Case updated and sent for review again"
              : "Case sent for review from case detail page",
        },
      }),
    ]);

    return redirect(`/app/cases/${approvalCase.id}`);
  }

  if (intent === "approve") {
    if (approvalCase.status !== "SENT_FOR_REVIEW") {
      return {
        errors: {
          form: "Only cases in SENT_FOR_REVIEW can be approved.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    await db.$transaction([
      db.approvalCase.update({
        where: { id: approvalCase.id },
        data: {
          status: "APPROVED",
        },
      }),
      db.approvalAction.create({
        data: {
          approvalCaseId: approvalCase.id,
          actorType: "MERCHANT",
          actionType: "APPROVE",
          note: "Case approved from case detail page",
        },
      }),
    ]);

    return redirect(`/app/cases/${approvalCase.id}`);
  }

  if (intent === "requestChanges") {
    if (approvalCase.status !== "SENT_FOR_REVIEW") {
      return {
        errors: {
          form: "Only cases in SENT_FOR_REVIEW can request changes.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    await db.$transaction([
      db.approvalCase.update({
        where: { id: approvalCase.id },
        data: {
          status: "CHANGES_REQUESTED",
        },
      }),
      db.approvalAction.create({
        data: {
          approvalCaseId: approvalCase.id,
          actorType: "MERCHANT",
          actionType: "REQUEST_CHANGES",
          note: "Changes requested from case detail page",
        },
      }),
    ]);

    return redirect(`/app/cases/${approvalCase.id}`);
  }

  if (intent === "reject") {
    if (approvalCase.status !== "SENT_FOR_REVIEW") {
      return {
        errors: {
          form: "Only cases in SENT_FOR_REVIEW can be rejected.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    await db.$transaction([
      db.approvalCase.update({
        where: { id: approvalCase.id },
        data: {
          status: "REJECTED",
        },
      }),
      db.approvalAction.create({
        data: {
          approvalCaseId: approvalCase.id,
          actorType: "MERCHANT",
          actionType: "REJECT",
          note: "Case rejected from case detail page",
        },
      }),
    ]);

    return redirect(`/app/cases/${approvalCase.id}`);
  }

  if (intent === "prepareHandoff") {
    if (approvalCase.status !== "APPROVED") {
      return {
        errors: {
          form: "Only approved cases can be prepared for Shopify handoff.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    await db.$transaction([
      db.approvalCase.update({
        where: { id: approvalCase.id },
        data: {
          handoffPreparedAt: new Date(),
        },
      }),
      db.approvalAction.create({
        data: {
          approvalCaseId: approvalCase.id,
          actorType: "MERCHANT",
          actionType: "PREPARE_HANDOFF",
          note: "Case marked as ready for Shopify handoff",
        },
      }),
    ]);

    return redirect(`/app/cases/${approvalCase.id}`);
  }

  if (intent === "createDraftOrder") {
    if (approvalCase.status !== "APPROVED") {
      return {
        errors: {
          form: "Only approved cases can create a Shopify draft order.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    if (!approvalCase.handoffPreparedAt) {
      return {
        errors: {
          form: "Prepare the Shopify handoff before creating the draft order.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    if (approvalCase.shopifyDraftOrderId) {
      return {
        errors: {
          form: "A Shopify draft order already exists for this case.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    const input: {
      note: string;
      lineItems: Array<{
        title: string;
        originalUnitPrice: number;
        quantity: number;
        customAttributes: Array<{ key: string; value: string }>;
      }>;
      email?: string;
    } = {
      note: `Approval case ${approvalCase.externalReference || approvalCase.id}`,
      lineItems: [
        {
          title: approvalCase.title,
          originalUnitPrice: 0,
          quantity: 1,
          customAttributes: [
            { key: "approval_case_id", value: approvalCase.id },
            {
              key: "approval_case_reference",
              value: approvalCase.externalReference || approvalCase.id,
            },
            { key: "approval_status", value: approvalCase.status },
          ],
        },
      ],
    };

    if (approvalCase.customerEmail) {
      input.email = approvalCase.customerEmail;
    }

    const response = await admin.graphql(
      `#graphql
        mutation draftOrderCreate($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              invoiceUrl
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: { input },
      },
    );

    const json = (await response.json()) as DraftOrderCreateResponse;
    const userErrors = json.data?.draftOrderCreate?.userErrors ?? [];

    if (userErrors.length > 0) {
      return {
        errors: {
          form: userErrors.map((error) => error.message).join(" | "),
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    const draftOrder = json.data?.draftOrderCreate?.draftOrder;
    if (!draftOrder) {
      return {
        errors: {
          form: "Draft order creation returned no draft order.",
        },
        values: {
          summary: "",
        },
      } satisfies ActionData;
    }

    await db.$transaction([
      db.approvalCase.update({
        where: { id: approvalCase.id },
        data: {
          status: "DRAFT_ORDER_CREATED",
          shopifyDraftOrderId: draftOrder.id,
          shopifyDraftOrderName: draftOrder.name,
          shopifyInvoiceUrl: draftOrder.invoiceUrl ?? null,
        },
      }),
      db.approvalAction.create({
        data: {
          approvalCaseId: approvalCase.id,
          actorType: "SYSTEM",
          actionType: "CREATE_DRAFT_ORDER",
          note: `Shopify draft order ${draftOrder.name} created`,
        },
      }),
    ]);

    return redirect(`/app/cases/${approvalCase.id}`);
  }

  throw new Response("Unsupported action", { status: 400 });
};

export default function ApprovalCaseDetail() {
  const { approvalCase } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const currentIntent = navigation.formData?.get("intent");
  const isSubmittingRevision =
    navigation.state === "submitting" && currentIntent === "addRevision";
  const isSubmittingSend =
    navigation.state === "submitting" && currentIntent === "sendForReview";
  const isSubmittingApprove =
    navigation.state === "submitting" && currentIntent === "approve";
  const isSubmittingRequestChanges =
    navigation.state === "submitting" && currentIntent === "requestChanges";
  const isSubmittingReject =
    navigation.state === "submitting" && currentIntent === "reject";
  const isSubmittingPrepareHandoff =
    navigation.state === "submitting" && currentIntent === "prepareHandoff";
  const isSubmittingCreateDraftOrder =
    navigation.state === "submitting" && currentIntent === "createDraftOrder";

  const status = approvalCase.status as CaseStatus;
  const nextStep = getNextStep(status);
  const remainingSteps = getRemainingSteps(status);

  const canSendForReview =
    approvalCase.status === "DRAFT" ||
    approvalCase.status === "CHANGES_REQUESTED";
  const canApprove = approvalCase.status === "SENT_FOR_REVIEW";
  const canRequestChanges = approvalCase.status === "SENT_FOR_REVIEW";
  const canReject = approvalCase.status === "SENT_FOR_REVIEW";
  const canAddRevision =
    approvalCase.status !== "APPROVED" &&
    approvalCase.status !== "REJECTED" &&
    approvalCase.status !== "DRAFT_ORDER_CREATED" &&
    approvalCase.status !== "INVOICE_SENT" &&
    approvalCase.status !== "CONVERTED_TO_ORDER";
  const canPrepareHandoff =
    approvalCase.status === "APPROVED" && !approvalCase.handoffPreparedAt;
  const canCreateDraftOrder =
    approvalCase.status === "APPROVED" &&
    !!approvalCase.handoffPreparedAt &&
    !approvalCase.shopifyDraftOrderId;

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            {approvalCase.title}
          </div>

          <div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "30px",
                padding: "4px 12px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 700,
                ...getStatusBadgeStyle(approvalCase.status),
              }}
            >
              {formatLabel(approvalCase.status)}
            </span>
          </div>
        </div>

        <Link to="/app/cases">← Back to cases</Link>
      </div>

      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)",
        }}
      >
        <div
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: "16px",
            background: "#FFFFFF",
            padding: "16px",
            display: "grid",
            gap: "12px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            Overview
          </div>

          <div>Customer: {approvalCase.customerName || "—"}</div>
          <div>Email: {approvalCase.customerEmail || "—"}</div>
          <div>External reference: {approvalCase.externalReference || "—"}</div>
          <div>Currency: {approvalCase.currencyCode}</div>
          <div>
            Latest revision: {approvalCase.revisions[0]?.revisionNumber ?? "—"}
          </div>
          <div>
            Last action:{" "}
            {approvalCase.actions[0]
              ? formatLabel(approvalCase.actions[0].actionType)
              : "—"}
          </div>
          <div>Shopify handoff: {getHandoffState(approvalCase)}</div>
          <div>
            Draft order: {approvalCase.shopifyDraftOrderName || "—"}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: "16px",
            background: "#FFFFFF",
            padding: "16px",
            display: "grid",
            gap: "12px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            Next step
          </div>

          <div>{nextStep}</div>

          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#6B7280",
                marginBottom: "6px",
              }}
            >
              Remaining path
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {remainingSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "16px",
          background: "#FFFFFF",
          padding: "16px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Workflow actions
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <Form method="post">
            <input type="hidden" name="intent" value="sendForReview" />
            <button
              type="submit"
              disabled={isSubmittingSend || !canSendForReview}
            >
              {isSubmittingSend ? "Sending..." : "Send for review"}
            </button>
          </Form>

          <Form method="post">
            <input type="hidden" name="intent" value="approve" />
            <button type="submit" disabled={isSubmittingApprove || !canApprove}>
              {isSubmittingApprove ? "Approving..." : "Approve"}
            </button>
          </Form>

          <Form method="post">
            <input type="hidden" name="intent" value="requestChanges" />
            <button
              type="submit"
              disabled={isSubmittingRequestChanges || !canRequestChanges}
            >
              {isSubmittingRequestChanges
                ? "Requesting..."
                : "Request changes"}
            </button>
          </Form>

          <Form method="post">
            <input type="hidden" name="intent" value="reject" />
            <button type="submit" disabled={isSubmittingReject || !canReject}>
              {isSubmittingReject ? "Rejecting..." : "Reject"}
            </button>
          </Form>
        </div>

        {actionData?.errors?.form ? (
          <p style={{ color: "crimson", margin: 0 }}>{actionData.errors.form}</p>
        ) : null}
      </div>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "16px",
          background: "#FFFFFF",
          padding: "16px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Shopify handoff
        </div>

        <div
          style={{
            display: "grid",
            gap: "6px",
          }}
        >
          <div>State: {getHandoffState(approvalCase)}</div>
          <div>
            Prepared at:{" "}
            {approvalCase.handoffPreparedAt
              ? new Date(approvalCase.handoffPreparedAt).toLocaleString()
              : "—"}
          </div>
          <div>Draft Order ID: {approvalCase.shopifyDraftOrderId || "—"}</div>
          <div>Draft Order Name: {approvalCase.shopifyDraftOrderName || "—"}</div>
          <div>
            Invoice URL:{" "}
            {approvalCase.shopifyInvoiceUrl ? (
              <a
                href={approvalCase.shopifyInvoiceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open invoice
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>

        {!approvalCase.shopifyDraftOrderId ? (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Form method="post">
              <input type="hidden" name="intent" value="prepareHandoff" />
              <button
                type="submit"
                disabled={isSubmittingPrepareHandoff || !canPrepareHandoff}
              >
                {isSubmittingPrepareHandoff
                  ? "Preparing..."
                  : "Mark handoff ready"}
              </button>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="createDraftOrder" />
              <button
                type="submit"
                disabled={isSubmittingCreateDraftOrder || !canCreateDraftOrder}
              >
                {isSubmittingCreateDraftOrder
                  ? "Creating draft order..."
                  : "Create Draft Order"}
              </button>
            </Form>
          </div>
        ) : null}
      </div>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "16px",
          background: "#FFFFFF",
          padding: "16px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Audit trail
        </div>

        {approvalCase.actions.length === 0 ? (
          <div style={{ color: "#6B7280" }}>No activity recorded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            {approvalCase.actions.map((action) => (
              <div
                key={action.id}
                style={{
                  display: "grid",
                  gap: "4px",
                  borderLeft: "3px solid #D1D5DB",
                  paddingLeft: "12px",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {formatLabel(action.actionType)}
                </div>
                <div style={{ fontSize: "14px", color: "#374151" }}>
                  Actor: {formatLabel(action.actorType)}
                </div>
                <div style={{ fontSize: "14px", color: "#374151" }}>
                  {action.note || "—"}
                </div>
                <div style={{ fontSize: "12px", color: "#6B7280" }}>
                  {new Date(action.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "16px",
          background: "#FFFFFF",
          padding: "16px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Add revision
        </div>

        <Form method="post">
          <input type="hidden" name="intent" value="addRevision" />
          <div
            style={{
              display: "grid",
              gap: "12px",
              maxWidth: "720px",
            }}
          >
            <div>
              <label htmlFor="summary" style={{ display: "block", fontWeight: 600 }}>
                Revision summary
              </label>
              <textarea
                id="summary"
                name="summary"
                defaultValue={actionData?.values?.summary ?? ""}
                rows={4}
                style={{ width: "100%", padding: "8px" }}
                disabled={!canAddRevision}
              />
              {actionData?.errors?.summary ? (
                <p style={{ color: "crimson", marginTop: "4px" }}>
                  {actionData.errors.summary}
                </p>
              ) : null}
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmittingRevision || !canAddRevision}
              >
                {isSubmittingRevision ? "Adding..." : "Add revision"}
              </button>
            </div>

            {!canAddRevision ? (
              <p style={{ margin: 0, color: "#6B7280" }}>
                Revisions are disabled because this case is already completed or handed off.
              </p>
            ) : null}
          </div>
        </Form>
      </div>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "16px",
          background: "#FFFFFF",
          padding: "16px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Revisions
        </div>

        {approvalCase.revisions.length === 0 ? (
          <div style={{ color: "#6B7280" }}>No revisions available.</div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {approvalCase.revisions.map((revision) => (
              <div
                key={revision.id}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "12px",
                  padding: "14px",
                  background: "#FFFFFF",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                  Revision {revision.revisionNumber}
                </div>
                <div>Summary: {revision.summary || "—"}</div>
                <div style={{ marginTop: "6px", color: "#374151" }}>
                  Payload: {revision.payloadJson || "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};