import { ConfidentialBundle } from "./bundles";
import { stableStringify } from "./canonicalize";
import { hex32 } from "./hash";

export interface ReplicaDescriptor {
  mirrorUri: string;
  availabilityState: "PRIMARY" | "SYNCED" | "DEGRADED";
  trustBoundary: "INSTITUTIONAL" | "CLOUD_MIRROR" | "REGULATOR_ESCROW";
}

export function buildAvailabilityMetadata(
  bundle: ConfidentialBundle,
  policyHash: `0x${string}`,
  replicas: ReplicaDescriptor[] = [
    { mirrorUri: bundle.manifest.uri, availabilityState: "PRIMARY", trustBoundary: "INSTITUTIONAL" },
    { mirrorUri: bundle.manifest.uri.replace("ipfs://", "s3://mirror/"), availabilityState: "SYNCED", trustBoundary: "CLOUD_MIRROR" }
  ]
) {
  const metadata = {
    objectId: bundle.manifest.objectId,
    payloadHash: bundle.manifest.payloadHash,
    manifestHash: bundle.manifest.manifestHash,
    fieldRoot: bundle.manifest.fieldRoot,
    policyHash,
    uri: bundle.manifest.uri,
    availabilityClass: bundle.manifest.availabilityClass,
    bundleClass: bundle.manifest.bundleClass,
    recipientIds: bundle.manifest.recipientIds,
    replicas,
    contentType: "application/json",
    encrypted: true,
    trustModel: {
      controlPlane: "onchain registry",
      ciphertextPlane: "offchain mirrors",
      decryptionBoundary: "recipient key holder only"
    }
  };

  return {
    ...metadata,
    metadataHash: hex32(stableStringify(metadata))
  };
}
