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

function StatTile({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: "10px",
        padding: "10px 12px",
        background: "#FFFFFF",
        minHeight: "72px",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#6B7280",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "16px",
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function getHandoffState(caseItem: {
  handoffPreparedAt: string | Date | null;
  shopifyDraftOrderId: string | null;
  status: string;
}) {
  if (caseItem.shopifyDraftOrderId) return "Draft order created";
  if (caseItem.handoffPreparedAt) return "Ready";
  if (caseItem.status === "APPROVED") return "Pending";
  return "—";
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

  const [
    totalCases,
    draftCases,
    sentForReviewCases,
    approvedCases,
    changesRequestedCases,
    rejectedCases,
    handoffReadyCases,
    draftOrderCreatedCases,
    invoiceSentCases,
    recentCases,
  ] = await Promise.all([
    db.approvalCase.count({
      where: { shopInstallationId: shopInstallation.id },
    }),
    db.approvalCase.count({
      where: {
        shopInstallationId: shopInstallation.id,
        status: "DRAFT",
      },
    }),
    db.approvalCase.count({
      where: {
        shopInstallationId: shopInstallation.id,
        status: "SENT_FOR_REVIEW",
      },
    }),
    db.approvalCase.count({
      where: {
        shopInstallationId: shopInstallation.id,
        status: "APPROVED",
      },
    }),
    db.approvalCase.count({
      where: {
        shopInstallationId: shopInstallation.id,
        status: "CHANGES_REQUESTED",
      },
    }),
    db.approvalCase.count({
      where: {
        shopInstallationId: shopInstallation.id,
        status: "REJECTED",
      },
    }),
    db.approvalCase.count({
      where: {
        shopInstallationId: shopInstallation.id,
        handoffPreparedAt: { not: null },
        shopifyDraftOrderId: null,
      },
    }),
    db.approvalCase.count({
      where: {
        shopInstallationId: shopInstallation.id,
        shopifyDraftOrderId: { not: null },
      },
    }),
    db.approvalCase.count({
      where: {
        shopInstallationId: shopInstallation.id,
        status: "INVOICE_SENT",
      },
    }),
    db.approvalCase.findMany({
      where: { shopInstallationId: shopInstallation.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        actions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  return {
    shopDomain: session.shop,
    totalCases,
    draftCases,
    sentForReviewCases,
    approvedCases,
    changesRequestedCases,
    rejectedCases,
    handoffReadyCases,
    draftOrderCreatedCases,
    invoiceSentCases,
    recentCases,
  };
};

export default function Index() {
  const {
    shopDomain,
    totalCases,
    draftCases,
    sentForReviewCases,
    approvedCases,
    changesRequestedCases,
    rejectedCases,
    handoffReadyCases,
    draftOrderCreatedCases,
    invoiceSentCases,
    recentCases,
  } = useLoaderData<typeof loader>();

  return (
    <div style={{ display: "grid", gap: "16px" }}>
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
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "#6B7280",
              marginBottom: "4px",
            }}
          >
            Shop
          </div>
          <div style={{ fontWeight: 700 }}>{shopDomain}</div>
        </div>

        <div>
          <div
            style={{
              fontSize: "12px",
              color: "#6B7280",
              marginBottom: "8px",
            }}
          >
            Current workload
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: "8px",
            }}
          >
            <StatTile label="Total" value={totalCases} />
            <StatTile label="Draft" value={draftCases} />
            <StatTile label="In review" value={sentForReviewCases} />
            <StatTile label="Approved" value={approvedCases} />
            <StatTile label="Changes" value={changesRequestedCases} />
            <StatTile label="Rejected" value={rejectedCases} />
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "12px",
              color: "#6B7280",
              marginBottom: "8px",
            }}
          >
            Shopify handoff
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: "8px",
            }}
          >
            <StatTile label="Ready" value={handoffReadyCases} />
            <StatTile label="Draft orders" value={draftOrderCreatedCases} />
            <StatTile label="Invoice sent" value={invoiceSentCases} />
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
          Recent case activity
        </div>

        {recentCases.length === 0 ? (
          <div style={{ color: "#6B7280" }}>No case activity yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "760px",
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>Case</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Last action</th>
                  <th style={thStyle}>Handoff</th>
                  <th style={thStyle}>Draft order</th>
                  <th style={thStyle}>Updated</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {recentCases.map((approvalCase) => (
                  <tr key={approvalCase.id}>
                    <td style={tdStyleStrong}>{approvalCase.title}</td>
                    <td style={tdStyle}>{formatLabel(approvalCase.status)}</td>
                    <td style={tdStyle}>
                      {approvalCase.actions[0]
                        ? formatLabel(approvalCase.actions[0].actionType)
                        : "—"}
                    </td>
                    <td style={tdStyle}>{getHandoffState(approvalCase)}</td>
                    <td style={tdStyle}>{approvalCase.shopifyDraftOrderName || "—"}</td>
                    <td style={tdStyle}>
                      {new Date(approvalCase.updatedAt).toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      <Link to={`/app/cases/${approvalCase.id}`}>Open</Link>
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
  padding: "10px 8px",
  verticalAlign: "top",
  whiteSpace: "nowrap",
  fontSize: "14px",
};

const tdStyleStrong: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 600,
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};