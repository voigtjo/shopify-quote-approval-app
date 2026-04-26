import db from "../db.server";
import type { CurrentAdminActor, EffectiveApprovalRole } from "./approval-role";

type OnlineAssociatedUser = {
  email?: string | null;
  account_owner?: boolean | null;
  first_name?: string | null;
  last_name?: string | null;
};

type AdminSessionLike = {
  shop?: string;
  email?: string | null;
  accountOwner?: boolean | null;
  firstName?: string | null;
  lastName?: string | null;
  onlineAccessInfo?: {
    associated_user?: OnlineAssociatedUser | null;
  } | null;
};

function normalizeEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase();
}

function getSessionUser(session: AdminSessionLike) {
  const onlineUser = session.onlineAccessInfo?.associated_user;

  const email = onlineUser?.email ?? session.email ?? null;
  const isShopOwner =
    onlineUser?.account_owner === true || session.accountOwner === true;

  const firstName = onlineUser?.first_name ?? session.firstName ?? null;
  const lastName = onlineUser?.last_name ?? session.lastName ?? null;

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    email ||
    "Authenticated admin";

  return {
    email,
    isShopOwner,
    displayName,
  };
}

export async function getCurrentAdminActor(
  session: AdminSessionLike,
  shopInstallationId: string,
): Promise<CurrentAdminActor> {
  const sessionUser = getSessionUser(session);
  const normalizedEmail = normalizeEmail(sessionUser.email);

  if (sessionUser.isShopOwner) {
    return {
      email: sessionUser.email,
      displayName: sessionUser.displayName,
      isShopOwner: true,
      role: "OWNER",
    };
  }

  if (normalizedEmail) {
    const roleMapping = await db.approvalUserRole.findUnique({
      where: {
        shopInstallationId_email: {
          shopInstallationId,
          email: normalizedEmail,
        },
      },
    });

    const mappedRole =
      roleMapping && roleMapping.isActive
        ? (roleMapping.role as EffectiveApprovalRole)
        : null;

    return {
      email: sessionUser.email,
      displayName: sessionUser.displayName,
      isShopOwner: false,
      role: mappedRole,
    };
  }

  return {
    email: null,
    displayName: sessionUser.displayName,
    isShopOwner: false,
    role: null,
  };
}