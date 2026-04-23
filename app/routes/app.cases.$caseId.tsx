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
      return "Continue with the Shopify draft order process.";
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
      return ["Shopify handoff"];
    case "REJECTED":
      return ["No required steps remaining"];
    case "EXPIRED":
      return ["Review whether the flow should continue"];
    case "DRAFT_ORDER_CREATED":
      return ["Invoice or order continuation"];
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
      return {
        background: "#F3F4F6",
        color: "#374151",
      };
    case "SENT_FOR_REVIEW":
      return {
        background: "#DBEAFE",
        color: "#1D4ED8",
      };
    case "CHANGES_REQUESTED":
      return {
        background: "#FEF3C7",
        color: "#92400E",
      };
    case "APPROVED":
      return {
        background: "#DCFCE7",
        color: "#166534",
      };
    case "REJECTED":
      return {
        background: "#FEE2E2",
        color: "#991B1B",
      };
    default:
      return {
        background: "#F3F4F6",
        color: "#374151",
      };
  }
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
  const { session } = await authenticate.admin(request);

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
      approvalCase.status === "REJECTED"
    ) {
      errors.form =
        "Revisions cannot be added after a case is approved or rejected.";
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
    approvalCase.status !== "REJECTED";

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
                Revisions are disabled because this case is already completed.
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