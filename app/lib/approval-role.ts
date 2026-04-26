export type ApprovalPermission =
  | "CREATE_CASE"
  | "ADD_REVISION"
  | "SEND_FOR_REVIEW"
  | "DECIDE"
  | "PREPARE_HANDOFF"
  | "CREATE_DRAFT_ORDER"
  | "MANAGE_ROLES";

export type EffectiveApprovalRole = "STAFF" | "APPROVER" | "OWNER" | null;

export type CurrentAdminActor = {
  email: string | null;
  displayName: string;
  isShopOwner: boolean;
  role: EffectiveApprovalRole;
};

export function hasApprovalPermission(
  actor: CurrentAdminActor,
  permission: ApprovalPermission,
) {
  if (actor.role === "OWNER") {
    return true;
  }

  if (actor.role === "STAFF") {
    return (
      permission === "CREATE_CASE" ||
      permission === "ADD_REVISION" ||
      permission === "SEND_FOR_REVIEW" ||
      permission === "PREPARE_HANDOFF" ||
      permission === "CREATE_DRAFT_ORDER"
    );
  }

  if (actor.role === "APPROVER") {
    return permission === "DECIDE";
  }

  return false;
}

export function roleLabel(actor: CurrentAdminActor) {
  if (actor.role === "OWNER") return "Owner";
  if (actor.role === "STAFF") return "Staff";
  if (actor.role === "APPROVER") return "Approver";
  return "No role";
}