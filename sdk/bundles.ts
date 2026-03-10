import { stableStringify } from "./canonicalize";
import { decryptJson, encryptJson, hashBase64, randomDek, RecipientKeyPair, RecipientPublicKey, toRecipientPublicKey, unwrapDekForRecipient, wrapDekForRecipient } from "./crypto";
import { hex32 } from "./hash";
import { computeFieldRoot } from "./roots";

export type BundleClass = "partyA.full" | "partyB.shared" | "partyC.min" | "regulator.disclosure";

export interface TradePrivateFields {
  x: string;
  y: string;
  z: string;
  pricingDetails: Record<string, unknown>;
  counterpartyMetadata: Record<string, unknown>;
  internalRiskNotes: string;
}

export interface BundleRecipient extends RecipientPublicKey {
  institutionId: `0x${string}`;
}

export interface BundleRecipientWrap {
  recipientId: string;
  institutionId: `0x${string}`;
  ephemeralPublicKey: string;
  iv: string;
  authTag: string;
  wrappedKey: string;
  algorithm: "ECDH-AES-256-GCM";
}

export interface BundleManifest {
  objectId: `0x${string}`;
  bundleClass: BundleClass;
  visibleFields: string[];
  recipientIds: string[];
  fieldRoot: `0x${string}`;
  bundleCleartextHash: `0x${string}`;
  payloadHash: `0x${string}`;
  manifestHash: `0x${string}`;
  uri: string;
  availabilityClass: string;
  encryption: {
    algorithm: "AES-256-GCM";
    dekWrap: "ECDH-AES-256-GCM";
    iv: string;
    authTag: string;
    recipientWraps: BundleRecipientWrap[];
  };
}

export interface ConfidentialBundle {
  manifest: BundleManifest;
  ciphertext: string;
  cleartext: Record<string, unknown>;
}

const visibility: Record<BundleClass, (keyof TradePrivateFields)[]> = {
  "partyA.full": ["x", "y", "z", "pricingDetails", "counterpartyMetadata", "internalRiskNotes"],
  "partyB.shared": ["x", "y", "pricingDetails"],
  "partyC.min": ["y"],
  "regulator.disclosure": ["x", "y"]
};

function pickVisibleFields(bundleClass: BundleClass, privateFields: TradePrivateFields): Record<string, unknown> {
  return visibility[bundleClass].reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = privateFields[key];
    return acc;
  }, {});
}

function wrapContext(objectId: `0x${string}`, bundleClass: BundleClass, payloadHash: `0x${string}`): string {
  return stableStringify({ context: "bundle-dek-wrap", objectId, bundleClass, payloadHash });
}

export function buildBundleManifest(
  objectId: `0x${string}`,
  bundleClass: BundleClass,
  privateFields: TradePrivateFields,
  recipients: BundleRecipient[],
  uriBase: string
): ConfidentialBundle {
  const cleartext = pickVisibleFields(bundleClass, privateFields);
  const dek = randomDek();
  const envelope = encryptJson(cleartext, dek);
  const payloadHash = hex32(envelope.ciphertext + envelope.iv + envelope.authTag + hashBase64(envelope.ciphertext));
  const context = wrapContext(objectId, bundleClass, payloadHash);
  const recipientWraps = recipients.map((recipient) => ({
    ...wrapDekForRecipient(dek, recipient, context),
    institutionId: recipient.institutionId
  }));
  const fieldRoot = computeFieldRoot(privateFields as unknown as Record<string, unknown>);
  const bundleCleartextHash = hex32(stableStringify(cleartext));
  const manifest = {
    objectId,
    bundleClass,
    visibleFields: [...visibility[bundleClass]],
    recipientIds: recipients.map((recipient) => recipient.id),
    fieldRoot,
    bundleCleartextHash,
    payloadHash,
    manifestHash: hex32("pending"),
    uri: `${uriBase}/${payloadHash}.json`,
    availabilityClass: bundleClass,
    encryption: {
      algorithm: envelope.algorithm,
      dekWrap: "ECDH-AES-256-GCM" as const,
      iv: envelope.iv,
      authTag: envelope.authTag,
      recipientWraps
    }
  } satisfies Omit<BundleManifest, "manifestHash"> & { manifestHash: `0x${string}` };

  const manifestHash = hex32(stableStringify({ ...manifest, manifestHash: undefined }));

  return {
    manifest: { ...manifest, manifestHash },
    ciphertext: envelope.ciphertext,
    cleartext
  };
}

export function decryptBundleForRecipient<T extends Record<string, unknown>>(
  bundle: ConfidentialBundle,
  recipient: RecipientKeyPair
): T {
  const wrappedKey = bundle.manifest.encryption.recipientWraps.find((entry) => entry.recipientId === recipient.id);
  if (!wrappedKey) {
    throw new Error(`recipient ${recipient.id} is not authorized for ${bundle.manifest.bundleClass}`);
  }

  const dek = unwrapDekForRecipient(wrappedKey, recipient, wrapContext(bundle.manifest.objectId, bundle.manifest.bundleClass, bundle.manifest.payloadHash));
  return decryptJson<T>(
    {
      algorithm: "AES-256-GCM",
      iv: bundle.manifest.encryption.iv,
      authTag: bundle.manifest.encryption.authTag,
      ciphertext: bundle.ciphertext
    },
    dek
  );
}

export function recipientsFromKeyPairs(keyPairs: Array<RecipientKeyPair & { institutionId: `0x${string}` }>): BundleRecipient[] {
  return keyPairs.map((keyPair) => ({ ...toRecipientPublicKey(keyPair), institutionId: keyPair.institutionId }));
}
