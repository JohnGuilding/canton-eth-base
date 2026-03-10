import { stableStringify } from "./canonicalize";
import { hex32 } from "./hash";
import { merkleRoot } from "./merkle";

export function computeFieldRoot(fields: Record<string, unknown>): `0x${string}` {
  return merkleRoot(fields);
}

export function computeStakeholderRoot(stakeholders: Record<string, unknown>): `0x${string}` {
  return merkleRoot(stakeholders);
}

export function computeComplianceRoot(assertions: Array<Record<string, unknown>>): `0x${string}` {
  const indexed = assertions.reduce<Record<string, unknown>>((acc, assertion, index) => {
    acc[`assertion:${index}`] = assertion;
    return acc;
  }, {});
  return merkleRoot(indexed);
}

export function computePolicyHash(policy: unknown): `0x${string}` {
  return hex32(stableStringify(policy));
}
