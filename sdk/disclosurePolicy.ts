import { SignedApprovalArtifact } from "./identity";

export interface DisclosurePolicyRule {
  policyName: string;
  lawfulBasisCode: string;
  allowedFields: string[];
  retentionClass: "SHORT" | "MEDIUM" | "LONG";
  maxRetentionDays: number;
  acknowledgementRequired: boolean;
  dualControlRequired: boolean;
}

export interface DisclosureRequest {
  objectId: `0x${string}`;
  recipientInstitutionId: `0x${string}`;
  recipientDid: string;
  lawfulBasisCode: string;
  requestedFields: string[];
  requestedAt: string;
  requestedBy: string;
  note: string;
}

export interface DisclosureDecision {
  approved: boolean;
  scopeApproved: string[];
  scopeDenied: string[];
  retentionClass: DisclosurePolicyRule["retentionClass"];
  expiresAt: string;
  acknowledgementRequired: boolean;
  linkedApprovalHashes: `0x${string}`[];
  reasons: string[];
}

export function evaluateDisclosureRequest(
  rule: DisclosurePolicyRule,
  request: DisclosureRequest,
  approvals: SignedApprovalArtifact[]
): DisclosureDecision {
  const scopeApproved = request.requestedFields.filter((field) => rule.allowedFields.includes(field));
  const scopeDenied = request.requestedFields.filter((field) => !rule.allowedFields.includes(field));
  const reasons: string[] = [];
  const linkedApprovalHashes = approvals.map((approval) => approval.approvalHash);

  if (request.lawfulBasisCode !== rule.lawfulBasisCode) {
    reasons.push("lawful basis mismatch");
  }
  if (scopeApproved.length === 0) {
    reasons.push("no fields approved by policy");
  }
  if (scopeDenied.length > 0) {
    reasons.push(`requested out-of-scope fields: ${scopeDenied.join(",")}`);
  }
  if (rule.dualControlRequired && approvals.length < 2) {
    reasons.push("dual control approvals missing");
  }

  const approved = reasons.length === 0;
  return {
    approved,
    scopeApproved,
    scopeDenied,
    retentionClass: rule.retentionClass,
    expiresAt: new Date(Date.parse(request.requestedAt) + rule.maxRetentionDays * 24 * 60 * 60 * 1000).toISOString(),
    acknowledgementRequired: rule.acknowledgementRequired,
    linkedApprovalHashes,
    reasons
  };
}
