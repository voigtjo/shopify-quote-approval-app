import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  getCurrentAdminActor,
} from "../lib/approval-role.server";
import {
  hasApprovalPermission,
  roleLabel,
} from "../lib/approval-role";
import { logServerError, logServerInfo } from "../lib/log.server";

type ActionData = {
  error?: string;
};

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

  const actor = await getCurrentAdminActor(session, shopInstallation.id);

  if (!hasApprovalPermission(actor, "MANAGE_ROLES")) {
    throw new Response("You do not have permission to manage roles.", {
      status: 403,
    });
  }

  const roles = await db.approvalUserRole.findMany({
    where: { shopInstallationId: shopInstallation.id },
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
  });

  return {
    actor,
    roles,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
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

    if (!hasApprovalPermission(actor, "MANAGE_ROLES")) {
      throw new Response("You do not have permission to manage roles.", {
        status: 403,
      });
    }

    const formData = await request.formData();
    const intent = String(formData.get("intent") || "");

    if (intent === "upsertRole") {
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const displayName = String(formData.get("displayName") || "").trim();
      const role = String(formData.get("role") || "").trim();

      if (!email || !email.includes("@")) {
        return { error: "A valid email is required." } satisfies ActionData;
      }

      if (!["STAFF", "APPROVER", "OWNER"].includes(role)) {
        return { error: "A valid role is required." } satisfies ActionData;
      }

      await db.approvalUserRole.upsert({
        where: {
          shopInstallationId_email: {
            shopInstallationId: shopInstallation.id,
            email,
          },
        },
        update: {
          displayName: displayName || null,
          role: role as "STAFF" | "APPROVER" | "OWNER",
          isActive: true,
        },
        create: {
          shopInstallationId: shopInstallation.id,
          email,
          displayName: displayName || null,
          role: role as "STAFF" | "APPROVER" | "OWNER",
          isActive: true,
        },
      });

      logServerInfo("Approval role upserted", {
        route: "app.settings.roles",
        email,
        role,
        shop: session.shop,
      });

      return null;
    }

    if (intent === "toggleRole") {
      const roleId = String(formData.get("roleId") || "");

      const existing = await db.approvalUserRole.findFirst({
        where: {
          id: roleId,
          shopInstallationId: shopInstallation.id,
        },
      });

      if (!existing) {
        return { error: "Role mapping not found." } satisfies ActionData;
      }

      await db.approvalUserRole.update({
        where: { id: existing.id },
        data: {
          isActive: !existing.isActive,
        },
      });

      logServerInfo("Approval role toggled", {
        route: "app.settings.roles",
        roleId,
        isActive: !existing.isActive,
        shop: session.shop,
      });

      return null;
    }

    return { error: "Unsupported action." } satisfies ActionData;
  } catch (error) {
    if (error instanceof Response) throw error;

    logServerError("Failed to update approval roles", error, {
      route: "app.settings.roles",
    });

    return {
      error: "The role update failed. Please try again.",
    } satisfies ActionData;
  }
};

export default function ApprovalRolesPage() {
  const { actor, roles } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: "16px",
        background: "#FFFFFF",
        padding: "16px",
        display: "grid",
        gap: "16px",
      }}
    >
      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>Approval roles</div>
        <div>
          Current admin: {actor.displayName} ({roleLabel(actor)})
        </div>
        <div style={{ color: "#6B7280" }}>
          Shop owners are treated as OWNER automatically when available. On this
          dev store, if Shopify doesn’t expose user identity in the admin
          session, the authenticated admin falls back to OWNER so role
          configuration remains testable.
        </div>
      </div>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "14px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div style={{ fontWeight: 700 }}>Add or update role</div>

        <Form method="post">
          <input type="hidden" name="intent" value="upsertRole" />
          <div
            style={{
              display: "grid",
              gap: "12px",
              maxWidth: "720px",
            }}
          >
            <div>
              <label htmlFor="email" style={{ display: "block", fontWeight: 600 }}>
                Shopify admin email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                style={{ width: "100%", padding: "10px" }}
                required
              />
            </div>

            <div>
              <label
                htmlFor="displayName"
                style={{ display: "block", fontWeight: 600 }}
              >
                Display name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                style={{ width: "100%", padding: "10px" }}
              />
            </div>

            <div>
              <label htmlFor="role" style={{ display: "block", fontWeight: 600 }}>
                Role
              </label>
              <select
                id="role"
                name="role"
                style={{ width: "100%", padding: "10px" }}
                defaultValue="STAFF"
              >
                <option value="STAFF">STAFF</option>
                <option value="APPROVER">APPROVER</option>
                <option value="OWNER">OWNER</option>
              </select>
            </div>

            {actionData?.error ? (
              <div style={{ color: "crimson" }}>{actionData.error}</div>
            ) : null}

            <div>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save role"}
              </button>
            </div>
          </div>
        </Form>
      </div>

      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "14px",
          display: "grid",
          gap: "12px",
        }}
      >
        <div style={{ fontWeight: 700 }}>Configured roles</div>

        {roles.length === 0 ? (
          <div style={{ color: "#6B7280" }}>No additional role mappings yet.</div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {roles.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "10px",
                  padding: "12px",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {item.displayName || item.email}
                </div>
                <div>Email: {item.email}</div>
                <div>Role: {item.role}</div>
                <div>Status: {item.isActive ? "Active" : "Inactive"}</div>

                <Form method="post">
                  <input type="hidden" name="intent" value="toggleRole" />
                  <input type="hidden" name="roleId" value={item.id} />
                  <button type="submit" disabled={isSubmitting}>
                    {item.isActive ? "Deactivate" : "Activate"}
                  </button>
                </Form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Roles page unavailable";
  let message = "The approval roles page could not be loaded.";

  if (isRouteErrorResponse(error)) {
    title = `Request failed (${error.status})`;
    message =
      typeof error.data === "string"
        ? error.data
        : "The approval roles page could not be loaded.";
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