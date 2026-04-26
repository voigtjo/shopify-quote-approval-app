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

function CompactStatCard(props: { label: string; value: number }) {
  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: "12px",
        background: "#FFFFFF",
        padding: "10px 12px",
        display: "grid",
        gap: "2px",
      }}
    >
      <div style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.2 }}>
        {props.label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, lineHeight: 1.1 }}>
        {props.value}
      </div>
    </div>
  );
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

    const allCases = await db.approvalCase.findMany({
      where: { shopInstallationId: shopInstallation.id },
      include: {
        actions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const recentCases = allCases.slice(0, 8);

    const counts = {
      total: allCases.length,
      draft: allCases.filter((item) => item.status === "DRAFT").length,
      inReview: allCases.filter((item) => item.status === "SENT_FOR_REVIEW")
        .length,
      approved: allCases.filter((item) => item.status === "APPROVED").length,
      changes: allCases.filter((item) => item.status === "CHANGES_REQUESTED")
        .length,
      rejected: allCases.filter((item) => item.status === "REJECTED").length,
      ready: allCases.filter(
        (item) =>
          item.status === "APPROVED" &&
          !!item.handoffPreparedAt &&
          !item.shopifyDraftOrderId,
      ).length,
      draftOrders: allCases.filter(
        (item) => item.status === "DRAFT_ORDER_CREATED",
      ).length,
      invoiceSent: allCases.filter((item) => item.status === "INVOICE_SENT")
        .length,
    };

    return {
      actor,
      shopDomain: shopInstallation.shopDomain,
      counts,
      recentCases,
    };
  } catch (error) {
    logServerError("Failed to load dashboard", error, {
      route: "app._index",
    });

    throw new Response("The dashboard could not be loaded.", {
      status: 500,
    });
  }
};

export default function AppDashboard() {
  const { actor, shopDomain, counts, recentCases } =
    useLoaderData<typeof loader>();

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
        <div style={{ fontSize: "14px", color: "#6B7280" }}>Shop</div>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>{shopDomain}</div>

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
          Current admin: {actor.email || actor.displayName} ({roleLabel(actor)})
        </div>
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        <div style={{ fontWeight: 700 }}>Current workload</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: "8px",
          }}
        >
          <CompactStatCard label="Total" value={counts.total} />
          <CompactStatCard label="Draft" value={counts.draft} />
          <CompactStatCard label="In review" value={counts.inReview} />
          <CompactStatCard label="Approved" value={counts.approved} />
          <CompactStatCard label="Changes" value={counts.changes} />
          <CompactStatCard label="Rejected" value={counts.rejected} />
        </div>
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        <div style={{ fontWeight: 700 }}>Shopify handoff</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "8px",
          }}
        >
          <CompactStatCard label="Ready" value={counts.ready} />
          <CompactStatCard label="Draft orders" value={counts.draftOrders} />
          <CompactStatCard label="Invoice sent" value={counts.invoiceSent} />
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
        <div style={{ fontSize: "18px", fontWeight: 700 }}>
          Recent case activity
        </div>

        {recentCases.length === 0 ? (
          <div style={{ color: "#6B7280" }}>No approval cases exist yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ padding: "10px 8px" }}>Case</th>
                  <th style={{ padding: "10px 8px" }}>Status</th>
                  <th style={{ padding: "10px 8px" }}>Last action</th>
                  <th style={{ padding: "10px 8px" }}>Handoff</th>
                  <th style={{ padding: "10px 8px" }}>Draft order</th>
                  <th style={{ padding: "10px 8px" }}>Updated</th>
                  <th style={{ padding: "10px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {recentCases.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid #F3F4F6", verticalAlign: "top" }}
                  >
                    <td style={{ padding: "12px 8px" }}>
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
                          ...getStatusBadgeStyle(item.status),
                        }}
                      >
                        {formatLabel(item.status)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.actions[0]
                        ? formatLabel(item.actions[0].actionType)
                        : "—"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{getHandoffState(item)}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {item.shopifyDraftOrderName || "—"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {new Date(item.updatedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
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

  let title = "Dashboard unavailable";
  let message = "The dashboard could not be loaded.";

  if (isRouteErrorResponse(error)) {
    title = `Request failed (${error.status})`;
    message =
      typeof error.data === "string"
        ? error.data
        : "The dashboard could not be loaded.";
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