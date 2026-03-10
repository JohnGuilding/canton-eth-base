import { Wallet, verifyTypedData } from "ethers";
import { stableStringify } from "./canonicalize";
import { hex32 } from "./hash";

export type AuthorityClass = "EXECUTION" | "VIEWING" | "RECOVERY" | "APPROVAL";
export type RoleName = "ADMIN" | "TRADER" | "OPS" | "REGULATOR" | "VIEWER" | "APPROVER" | "RECOVERY_AGENT";

export interface InstitutionIdentity {
  institutionId: `0x${string}`;
  code: string;
  name: string;
  did: string;
  didDocumentUri: string;
  didDocumentHash: `0x${string}`;
}

export interface DelegateAuthority {
  institutionId: `0x${string}`;
  delegate: string;
  authority: AuthorityClass;
  scope: string[];
  notBefore: number;
  notAfter: number;
  roleAttestationHash?: `0x${string}`;
}

export interface SignedRoleAttestation {
  payload: {
    subject: string;
    institutionId: `0x${string}`;
    institutionDid: string;
    role: RoleName;
    authority: AuthorityClass;
    scope: string[];
    issuedAt: number;
    expiresAt: number;
    nonce: string;
  };
  signer: string;
  signature: string;
  attestationHash: `0x${string}`;
}

export interface SignedApprovalArtifact {
  payload: {
    objectId: `0x${string}`;
    approvalKind: string;
    approverInstitutionId: `0x${string}`;
    approverDid: string;
    roleAttestationHash: `0x${string}`;
    artifactHash: `0x${string}`;
    linkedDisclosureId?: `0x${string}`;
    linkedReceiptHash?: `0x${string}`;
    note: string;
    issuedAt: number;
    expiresAt: number;
    nonce: string;
  };
  signer: string;
  signature: string;
  approvalHash: `0x${string}`;
}

const roleTypes = {
  RoleAttestation: [
    { name: "subject", type: "address" },
    { name: "institutionId", type: "bytes32" },
    { name: "institutionDid", type: "string" },
    { name: "role", type: "string" },
    { name: "authority", type: "string" },
    { name: "scopeHash", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "nonce", type: "string" }
  ]
} as const;

const approvalTypes = {
  ApprovalArtifact: [
    { name: "objectId", type: "bytes32" },
    { name: "approvalKind", type: "string" },
    { name: "approverInstitutionId", type: "bytes32" },
    { name: "approverDid", type: "string" },
    { name: "roleAttestationHash", type: "bytes32" },
    { name: "artifactHash", type: "bytes32" },
    { name: "linkedDisclosureId", type: "bytes32" },
    { name: "linkedReceiptHash", type: "bytes32" },
    { name: "note", type: "string" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "nonce", type: "string" }
  ]
} as const;

function scopeHash(scope: string[]): `0x${string}` {
  return hex32(stableStringify([...scope].sort()));
}

function domain(chainId = 8453) {
  return {
    name: "CantonBaseIdentity",
    version: "1",
    chainId,
    verifyingContract: "0x0000000000000000000000000000000000000001"
  };
}

export async function issueRoleAttestation(
  wallet: Wallet,
  input: Omit<SignedRoleAttestation["payload"], "nonce"> & { nonce?: string },
  chainId?: number
): Promise<SignedRoleAttestation> {
  const payload = {
    ...input,
    nonce: input.nonce ?? hex32(`${input.subject}:${input.role}:${input.issuedAt}`)
  };
  const signature = await wallet.signTypedData(domain(chainId), roleTypes, {
    ...payload,
    scopeHash: scopeHash(payload.scope)
  });
  return {
    payload,
    signer: wallet.address,
    signature,
    attestationHash: hex32(stableStringify({ payload, signer: wallet.address, signature }))
  };
}

export function verifyRoleAttestation(attestation: SignedRoleAttestation, expectedSigner?: string, chainId?: number): boolean {
  const signer = verifyTypedData(domain(chainId), roleTypes, {
    ...attestation.payload,
    scopeHash: scopeHash(attestation.payload.scope)
  }, attestation.signature);
  return signer.toLowerCase() === (expectedSigner ?? attestation.signer).toLowerCase();
}

export async function signApprovalArtifact(
  wallet: Wallet,
  input: Omit<SignedApprovalArtifact["payload"], "nonce" | "linkedDisclosureId" | "linkedReceiptHash"> & {
    nonce?: string;
    linkedDisclosureId?: `0x${string}`;
    linkedReceiptHash?: `0x${string}`;
  },
  chainId?: number
): Promise<SignedApprovalArtifact> {
  const payload = {
    ...input,
    linkedDisclosureId: input.linkedDisclosureId ?? ("0x" + "00".repeat(32)) as `0x${string}`,
    linkedReceiptHash: input.linkedReceiptHash ?? ("0x" + "00".repeat(32)) as `0x${string}`,
    nonce: input.nonce ?? hex32(`${input.objectId}:${input.approvalKind}:${input.issuedAt}`)
  };
  const signature = await wallet.signTypedData(domain(chainId), approvalTypes, payload);
  return {
    payload,
    signer: wallet.address,
    signature,
    approvalHash: hex32(stableStringify({ payload, signer: wallet.address, signature }))
  };
}

export function verifyApprovalArtifact(artifact: SignedApprovalArtifact, expectedSigner?: string, chainId?: number): boolean {
  const signer = verifyTypedData(domain(chainId), approvalTypes, artifact.payload, artifact.signature);
  return signer.toLowerCase() === (expectedSigner ?? artifact.signer).toLowerCase();
}
