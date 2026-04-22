import type { HeadersFunction } from "react-router";
import { Link, Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function CasesLayout() {
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
        <div
          style={{
            fontSize: "18px",
            fontWeight: 700,
          }}
        >
          Cases
        </div>

        <Link
          to="/app/cases/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "44px",
            padding: "10px 16px",
            borderRadius: "12px",
            textDecoration: "none",
            fontWeight: 600,
            background: "#111827",
            color: "#FFFFFF",
          }}
        >
          New Case
        </Link>
      </div>

      <Outlet />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};