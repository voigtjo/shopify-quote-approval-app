import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

function NavButton({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "44px",
        padding: "10px 16px",
        borderRadius: "12px",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: "14px",
        color: active ? "#111827" : "#374151",
        background: active ? "#E5E7EB" : "#FFFFFF",
        border: "1px solid #D1D5DB",
      }}
    >
      {label}
    </Link>
  );
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();

  const pathname = location.pathname;

  const isDashboard = pathname === "/app" || pathname === "/app/";
  const isNewCase = pathname === "/app/cases/new";
  const isRoles = pathname === "/app/settings/roles";
  const isCases =
    (pathname === "/app/cases" || pathname.startsWith("/app/cases/")) &&
    !isNewCase;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div
        style={{
          display: "grid",
          gap: "16px",
          paddingTop: "16px",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "12px",
            border: "1px solid #E5E7EB",
            borderRadius: "16px",
            background: "#FFFFFF",
            padding: "16px",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            Quote Approval App
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <NavButton to="/app" label="Dashboard" active={isDashboard} />
            <NavButton to="/app/cases" label="Cases" active={isCases} />
            <NavButton to="/app/cases/new" label="New Case" active={isNewCase} />
            <NavButton
              to="/app/settings/roles"
              label="Roles"
              active={isRoles}
            />
          </div>
        </div>

        <Outlet />
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};