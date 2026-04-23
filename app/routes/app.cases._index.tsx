import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getNextStepShort(status: string) {
  switch (status) {
    case "DRAFT":
      return "Review and send";
    case "SENT_FOR_REVIEW":
      return "Decide";
    case "CHANGES_REQUESTED":
      return "Revise and resend";
    case "APPROVED":
      return "Prepare handoff";
    case "REJECTED":
      return "Closed";
    case "EXPIRED":
      return "Review";
    case "DRAFT_ORDER_CREATED":
      return "Continue in Shopify";
    case "INVOICE_SENT":
      return "Wait for payment";
    case "CONVERTED_TO_ORDER":
      return "Completed";
    default:
      return "Review";
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
    approvalCases,
  };
};

export default function CasesIndexPage() {
  const { approvalCases } = useLoaderData<typeof loader>();

  return (
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              marginBottom: "4px",
            }}
          >
            All approval cases
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#6B7280",
            }}
          >
            Open a case to continue the workflow, review the status, and inspect the audit trail.
          </div>
        </div>
      </div>

      {approvalCases.length === 0 ? (
        <div style={{ color: "#6B7280" }}>No approval cases exist yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "980px",
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Revision</th>
                <th style={thStyle}>Last action</th>
                <th style={thStyle}>Next step</th>
                <th style={thStyle}>Updated</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {approvalCases.map((approvalCase) => (
                <tr key={approvalCase.id}>
                  <td style={tdStyleStrong}>{approvalCase.title}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: "28px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        ...getStatusBadgeStyle(approvalCase.status),
                      }}
                    >
                      {formatLabel(approvalCase.status)}
                    </span>
                  </td>
                  <td style={tdStyle}>{approvalCase.customerName || "—"}</td>
                  <td style={tdStyle}>
                    {approvalCase.revisions[0]?.revisionNumber ?? "—"}
                  </td>
                  <td style={tdStyle}>
                    {approvalCase.actions[0]
                      ? formatLabel(approvalCase.actions[0].actionType)
                      : "—"}
                  </td>
                  <td style={tdStyle}>{getNextStepShort(approvalCase.status)}</td>
                  <td style={tdStyle}>
                    {new Date(approvalCase.updatedAt).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    <Link
                      to={`/app/cases/${approvalCase.id}`}
                      style={openLinkStyle}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: "12px",
  color: "#6B7280",
  borderBottom: "1px solid #E5E7EB",
  padding: "10px 8px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #F3F4F6",
  padding: "12px 8px",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  fontSize: "14px",
};

const tdStyleStrong: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 600,
};

const openLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "36px",
  padding: "6px 12px",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: 600,
  background: "#F9FAFB",
  border: "1px solid #D1D5DB",
  color: "#111827",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};