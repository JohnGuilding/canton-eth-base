import { stableStringify } from "./canonicalize";
import { BundleManifest, TradePrivateFields } from "./bundles";
import { hex32 } from "./hash";
import { MerkleProof, merkleProof, verifyMerkleProof } from "./merkle";

export interface DisclosurePackageInput {
  objectId: string;
  policyName: string;
  policyHash: `0x${string}`;
  lawfulBasis: string;
  recipientInstitutionCode: string;
  bundle: BundleManifest;
  privateFields: TradePrivateFields;
  fieldsDisclosed: (keyof TradePrivateFields)[];
  note: string;
}

export interface DisclosurePackage {
  disclosureId: `0x${string}`;
  packageHash: `0x${string}`;
  disclosedFieldsRoot: `0x${string}`;
  payload: {
    objectId: string;
    policyName: string;
    policyHash: `0x${string}`;
    lawfulBasis: string;
    recipientInstitutionCode: string;
    bundleClass: string;
    payloadHash: `0x${string}`;
    manifestHash: `0x${string}`;
    fieldRoot: `0x${string}`;
    disclosedFields: Record<string, unknown>;
    proofs: MerkleProof[];
    note: string;
    issuedAt: string;
  };
}

export function buildDisclosurePackage(input: DisclosurePackageInput): DisclosurePackage {
  const disclosedFields = input.fieldsDisclosed.reduce<Record<string, unknown>>((acc, field) => {
    acc[field] = input.privateFields[field];
    return acc;
  }, {});

  const proofs = input.fieldsDisclosed.map((field) => merkleProof(input.privateFields as unknown as Record<string, unknown>, field));
  const payload = {
    objectId: input.objectId,
    policyName: input.policyName,
    policyHash: input.policyHash,
    lawfulBasis: input.lawfulBasis,
    recipientInstitutionCode: input.recipientInstitutionCode,
    bundleClass: input.bundle.bundleClass,
    payloadHash: input.bundle.payloadHash,
    manifestHash: input.bundle.manifestHash,
    fieldRoot: input.bundle.fieldRoot,
    disclosedFields,
    proofs,
    note: input.note,
    issuedAt: new Date().toISOString()
  };

  return {
    disclosureId: hex32(`disclosure:${input.objectId}:${input.recipientInstitutionCode}:${input.lawfulBasis}:${input.bundle.manifestHash}`),
    packageHash: hex32(stableStringify(payload)),
    disclosedFieldsRoot: hex32(stableStringify(disclosedFields)),
    payload
  };
}

export function verifyDisclosurePackage(disclosurePackage: DisclosurePackage): boolean {
  const payloadFields = Object.keys(disclosurePackage.payload.disclosedFields).sort();
  const proofFields = disclosurePackage.payload.proofs.map((proof) => proof.field).sort();
  if (payloadFields.join(",") !== proofFields.join(",")) {
    return false;
  }

  return disclosurePackage.payload.proofs.every((proof) => {
    const value = disclosurePackage.payload.disclosedFields[proof.field];
    return value !== undefined && proof.value === value && verifyMerkleProof(disclosurePackage.payload.fieldRoot, proof);
  });
}
