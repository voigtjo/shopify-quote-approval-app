import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Link,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logServerError } from "../lib/log.server";
import { getCurrentAdminActor } from "../lib/approval-role.server";
import { roleLabel } from "../lib/approval-role";

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusBadgeStyle(status: string) {
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

function getHandoffState(item: {
  handoffPreparedAt: string | Date | null;
  shopifyDraftOrderId: string | null;
  status: string;
}) {
  if (item.shopifyDraftOrderId) return "Draft order created";
  if (item.handoffPreparedAt) return "Ready";
  if (item.status === "APPROVED") return "Pending";
  return "—";
}

function getNextStep(status: string) {
  switch (status) {
    case "DRAFT":
      return "Review and send";
    case "SENT_FOR_REVIEW":
      return "Decision";
    case "CHANGES_REQUESTED":
      return "Revise and resend";
    case "APPROVED":
      return "Prepare handoff";
    case "DRAFT_ORDER_CREATED":
      return "Continue in Shopify";
    case "INVOICE_SENT":
      return "Wait for payment";
    case "CONVERTED_TO_ORDER":
      return "Completed";
    case "REJECTED":
      return "Closed";
    case "EXPIRED":
      return "Review";
    default:
      return "Review";
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);

    const shopInstallation = await db.shopInstallation.upsert({
      where: { shopDomain: session.shop },
      update: {},
      create: {
        shopDomain: session.shop,
        appName: "Quote Approval App",
      },
    });

    const actor = await getCurrentAdminActor(session, shopInstallation.id);

    const approvalCases = await db.approvalCase.findMany({
      where: { shopInstallationId: shopInstallation.id },
      include: {
        actions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return {
      actor,
      approvalCases,
    };
  } catch (error) {
    logServerError("Failed to load cases index", error, {
      route: "app.cases._index",
    });

    throw new Response("The cases page could not be loaded.", {
      status: 500,
    });
  }
};

export default function CasesIndexPage() {
  const { actor, approvalCases } = useLoaderData<typeof loader>();

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "16px",
          background: "#FFFFFF",
          padding: "16px",
          display: "grid",
          gap: "10px",
        }}
      >
        <div style={{ fontSize: "18px", fontWeight: 700 }}>
          All approval cases
        </div>
        <div style={{ color: "#6B7280" }}>
          Open a case to continue the workflow, inspect the audit trail, or
          continue the Shopify handoff.
        </div>
        <div
          style={{
            display: "inline-flex",
            width: "fit-content",
            alignItems: "center",
            minHeight: "30px",
            padding: "4px 12px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 700,
            background: "#F3F4F6",
            color: "#374151",
          }}
        >
          Current admin role: {roleLabel(actor)}
        </div>
      </div>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "16px",
          background: "#FFFFFF",
          padding: "16px",
          display: "grid",
          gap: "14px",
        }}
      >
        {approvalCases.length === 0 ? (
          <div style={{ color: "#6B7280" }}>No approval cases exist yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ padding: "10px 8px" }}>Title</th>
                  <th style={{ padding: "10px 8px" }}>Status</th>
                  <th style={{ padding: "10px 8px" }}>Customer</th>
                  <th style={{ padding: "10px 8px" }}>Revision</th>
                  <th style={{ padding: "10px 8px" }}>Last action</th>
                  <th style={{ padding: "10px 8px" }}>Next step</th>
                  <th style={{ padding: "10px 8px" }}>Handoff</th>
                  <th style={{ padding: "10px 8px" }}>Draft order</th>
                  <th style={{ padding: "10px 8px" }}>Updated</th>
                  <th style={{ padding: "10px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {approvalCases.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid #F3F4F6", verticalAlign: "top" }}
                  >
                    <td style={{ padding: "12px 8px", minWidth: "280px" }}>
                      <Link
                        to={`/app/cases/${item.id}`}
                        style={{ fontWeight: 700, textDecoration: "none" }}
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: "28px",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          ...getStatusBadgeStyle(item.status),
                        }}
                      >
                        {formatLabel(item.status)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.customerName || "—"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.status === "DRAFT_ORDER_CREATED" ||
                      item.status === "APPROVED" ||
                      item.status === "SENT_FOR_REVIEW" ||
                      item.status === "CHANGES_REQUESTED" ||
                      item.status === "REJECTED" ||
                      item.status === "INVOICE_SENT" ||
                      item.status === "CONVERTED_TO_ORDER" ||
                      item.status === "EXPIRED"
                        ? "1"
                        : "1"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.actions[0]
                        ? formatLabel(item.actions[0].actionType)
                        : "—"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{getNextStep(item.status)}</td>
                    <td style={{ padding: "12px 8px" }}>{getHandoffState(item)}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.shopifyDraftOrderName || "—"}
                    </td>
                    <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>
                      {new Date(item.updatedAt).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })}
                    </td>
                    <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>
                      <Link to={`/app/cases/${item.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Cases page unavailable";
  let message = "The cases page could not be loaded.";

  if (isRouteErrorResponse(error)) {
    title = `Request failed (${error.status})`;
    message =
      typeof error.data === "string"
        ? error.data
        : "The cases page could not be loaded.";
  }

  return (
    <div
      style={{
        border: "1px solid #FECACA",
        borderRadius: "16px",
        background: "#FEF2F2",
        padding: "16px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ fontSize: "18px", fontWeight: 700 }}>{title}</div>
      <div>{message}</div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};