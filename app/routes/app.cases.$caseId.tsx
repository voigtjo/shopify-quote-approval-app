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
    if (approvalCase.status !== "DRAFT") {
      return {
        errors: {
          form: "Only draft cases can be sent for review.",
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
          note: "Case sent for review from case detail page",
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

  return (
    <s-page heading={approvalCase.title}>
      <s-section heading="Overview">
        <s-paragraph>Status: {approvalCase.status}</s-paragraph>
        <s-paragraph>
          Customer: {approvalCase.customerName || "—"}
        </s-paragraph>
        <s-paragraph>
          Email: {approvalCase.customerEmail || "—"}
        </s-paragraph>
        <s-paragraph>
          External reference: {approvalCase.externalReference || "—"}
        </s-paragraph>
        <s-paragraph>
          Currency: {approvalCase.currencyCode}
        </s-paragraph>
      </s-section>

      <s-section heading="Workflow">
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Form method="post">
            <input type="hidden" name="intent" value="sendForReview" />
            <button
              type="submit"
              disabled={isSubmittingSend || approvalCase.status !== "DRAFT"}
            >
              {isSubmittingSend ? "Sending..." : "Send for review"}
            </button>
          </Form>

          <Form method="post">
            <input type="hidden" name="intent" value="approve" />
            <button
              type="submit"
              disabled={
                isSubmittingApprove || approvalCase.status !== "SENT_FOR_REVIEW"
              }
            >
              {isSubmittingApprove ? "Approving..." : "Approve"}
            </button>
          </Form>

          <Form method="post">
            <input type="hidden" name="intent" value="requestChanges" />
            <button
              type="submit"
              disabled={
                isSubmittingRequestChanges ||
                approvalCase.status !== "SENT_FOR_REVIEW"
              }
            >
              {isSubmittingRequestChanges
                ? "Requesting..."
                : "Request changes"}
            </button>
          </Form>

          <Form method="post">
            <input type="hidden" name="intent" value="reject" />
            <button
              type="submit"
              disabled={
                isSubmittingReject || approvalCase.status !== "SENT_FOR_REVIEW"
              }
            >
              {isSubmittingReject ? "Rejecting..." : "Reject"}
            </button>
          </Form>
        </div>

        {approvalCase.status === "DRAFT" ? (
          <p style={{ marginTop: "8px" }}>
            This case is currently in DRAFT and can be sent for review.
          </p>
        ) : null}

        {approvalCase.status === "SENT_FOR_REVIEW" ? (
          <p style={{ marginTop: "8px" }}>
            This case is awaiting a decision.
          </p>
        ) : null}

        {approvalCase.status !== "DRAFT" &&
        approvalCase.status !== "SENT_FOR_REVIEW" ? (
          <p style={{ marginTop: "8px" }}>
            This case already reached a later workflow state.
          </p>
        ) : null}

        {actionData?.errors?.form ? (
          <p style={{ color: "crimson", marginTop: "8px" }}>
            {actionData.errors.form}
          </p>
        ) : null}
      </s-section>

      <s-section heading="Add revision">
        <Form method="post">
          <input type="hidden" name="intent" value="addRevision" />
          <div
            style={{
              display: "grid",
              gap: "12px",
              maxWidth: "640px",
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
              />
              {actionData?.errors?.summary ? (
                <p style={{ color: "crimson", marginTop: "4px" }}>
                  {actionData.errors.summary}
                </p>
              ) : null}
            </div>

            <div>
              <button type="submit" disabled={isSubmittingRevision}>
                {isSubmittingRevision ? "Adding..." : "Add revision"}
              </button>
            </div>
          </div>
        </Form>
      </s-section>

      <s-section heading="Revisions">
        {approvalCase.revisions.length === 0 ? (
          <s-paragraph>No revisions available.</s-paragraph>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {approvalCase.revisions.map((revision) => (
              <s-box
                key={revision.id}
                padding="base"
                border="base"
                borderRadius="large"
              >
                <s-heading>Revision {revision.revisionNumber}</s-heading>
                <s-paragraph>
                  Summary: {revision.summary || "—"}
                </s-paragraph>
                <s-paragraph>
                  Payload: {revision.payloadJson || "—"}
                </s-paragraph>
              </s-box>
            ))}
          </div>
        )}
      </s-section>

      <s-section heading="Actions">
        {approvalCase.actions.length === 0 ? (
          <s-paragraph>No actions available.</s-paragraph>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {approvalCase.actions.map((action) => (
              <s-box
                key={action.id}
                padding="base"
                border="base"
                borderRadius="large"
              >
                <s-heading>{action.actionType}</s-heading>
                <s-paragraph>Actor: {action.actorType}</s-paragraph>
                <s-paragraph>Note: {action.note || "—"}</s-paragraph>
                <s-paragraph>
                  Created at: {new Date(action.createdAt).toLocaleString()}
                </s-paragraph>
              </s-box>
            ))}
          </div>
        )}
      </s-section>

      <s-section heading="Navigation">
        <Link to="/app">← Back to dashboard</Link>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};