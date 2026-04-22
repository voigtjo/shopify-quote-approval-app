import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
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
      }}
    >
      {approvalCases.length === 0 ? (
        <div style={{ color: "#6B7280" }}>No approval cases exist yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "780px",
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Revision</th>
                <th style={thStyle}>Last action</th>
                <th style={thStyle}>Updated</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {approvalCases.map((approvalCase) => (
                <tr key={approvalCase.id}>
                  <td style={tdStyleStrong}>{approvalCase.title}</td>
                  <td style={tdStyle}>{approvalCase.status}</td>
                  <td style={tdStyle}>{approvalCase.customerName || "—"}</td>
                  <td style={tdStyle}>{approvalCase.customerEmail || "—"}</td>
                  <td style={tdStyle}>
                    {approvalCase.revisions[0]?.revisionNumber ?? "—"}
                  </td>
                  <td style={tdStyle}>
                    {approvalCase.actions[0]?.actionType ?? "—"}
                  </td>
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