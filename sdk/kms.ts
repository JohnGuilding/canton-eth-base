import { BundleRecipient, BundleClass, ConfidentialBundle, TradePrivateFields, buildBundleManifest } from "./bundles";
import { generateRecipientKeyPair, RecipientKeyPair, toRecipientPublicKey } from "./crypto";
import { stableStringify } from "./canonicalize";
import { hex32 } from "./hash";

export type KeyStatus = "ACTIVE" | "ROTATED" | "REVOKED" | "RECOVERED";

export interface ManagedRecipientKey {
  institutionId: `0x${string}`;
  recipientId: string;
  keyVersion: number;
  keyPair: RecipientKeyPair;
  status: KeyStatus;
  createdAt: string;
  revokedAt?: string;
  supersededBy?: string;
}

export interface KeyManifest {
  institutionId: `0x${string}`;
  institutionDid: string;
  keyRingId: string;
  activeKeyId: string;
  recoveryContacts: string[];
  entries: ManagedRecipientKey[];
  manifestHash: `0x${string}`;
}

function stamp(): string {
  return new Date().toISOString();
}

function keyId(entry: Pick<ManagedRecipientKey, "recipientId" | "keyVersion">): string {
  return `${entry.recipientId}:v${entry.keyVersion}`;
}

function manifestHash(manifest: Omit<KeyManifest, "manifestHash">): `0x${string}` {
  return hex32(stableStringify({
    ...manifest,
    entries: manifest.entries.map((entry) => ({
      institutionId: entry.institutionId,
      recipientId: entry.recipientId,
      keyVersion: entry.keyVersion,
      publicKey: entry.keyPair.publicKey,
      status: entry.status,
      createdAt: entry.createdAt,
      revokedAt: entry.revokedAt,
      supersededBy: entry.supersededBy
    }))
  }));
}

export function createKeyManifest(institutionId: `0x${string}`, institutionDid: string, recipientId: string, recoveryContacts: string[] = []): KeyManifest {
  const entry: ManagedRecipientKey = {
    institutionId,
    recipientId,
    keyVersion: 1,
    keyPair: generateRecipientKeyPair(recipientId),
    status: "ACTIVE",
    createdAt: stamp()
  };
  const base = {
    institutionId,
    institutionDid,
    keyRingId: `${recipientId}-ring`,
    activeKeyId: keyId(entry),
    recoveryContacts,
    entries: [entry]
  };
  return { ...base, manifestHash: manifestHash(base) };
}

export function activeKey(manifest: KeyManifest): ManagedRecipientKey {
  const found = manifest.entries.find((entry) => keyId(entry) === manifest.activeKeyId);
  if (!found) throw new Error("missing active key");
  return found;
}

export function rotateKey(manifest: KeyManifest): KeyManifest {
  const current = activeKey(manifest);
  current.status = "ROTATED";
  const next: ManagedRecipientKey = {
    institutionId: manifest.institutionId,
    recipientId: current.recipientId,
    keyVersion: current.keyVersion + 1,
    keyPair: generateRecipientKeyPair(current.recipientId),
    status: "ACTIVE",
    createdAt: stamp()
  };
  current.supersededBy = keyId(next);
  const base = {
    ...manifest,
    activeKeyId: keyId(next),
    entries: [...manifest.entries, next]
  };
  return { ...base, manifestHash: manifestHash(base) };
}

export function revokeKey(manifest: KeyManifest, keyVersion?: number): KeyManifest {
  const version = keyVersion ?? activeKey(manifest).keyVersion;
  const entry = manifest.entries.find((candidate) => candidate.keyVersion === version);
  if (!entry) throw new Error("key version not found");
  entry.status = "REVOKED";
  entry.revokedAt = stamp();
  const base = { ...manifest };
  return { ...base, manifestHash: manifestHash(base) };
}

export function recoverKey(manifest: KeyManifest, recoveryRecipientId?: string): KeyManifest {
  const prior = activeKey(manifest);
  prior.status = "RECOVERED";
  const next: ManagedRecipientKey = {
    institutionId: manifest.institutionId,
    recipientId: recoveryRecipientId ?? prior.recipientId,
    keyVersion: prior.keyVersion + 1,
    keyPair: generateRecipientKeyPair(recoveryRecipientId ?? prior.recipientId),
    status: "ACTIVE",
    createdAt: stamp()
  };
  prior.supersededBy = keyId(next);
  const base = {
    ...manifest,
    activeKeyId: keyId(next),
    entries: [...manifest.entries, next]
  };
  return { ...base, manifestHash: manifestHash(base) };
}

export function bundleRecipientFromManifest(manifest: KeyManifest): BundleRecipient {
  const current = activeKey(manifest);
  return {
    ...toRecipientPublicKey(current.keyPair),
    institutionId: current.institutionId
  };
}

export function rewrapBundleForViewingChange(
  objectId: `0x${string}`,
  bundleClass: BundleClass,
  privateFields: TradePrivateFields,
  manifests: KeyManifest[],
  uriBase: string
): ConfidentialBundle {
  return buildBundleManifest(objectId, bundleClass, privateFields, manifests.map(bundleRecipientFromManifest), uriBase);
}
