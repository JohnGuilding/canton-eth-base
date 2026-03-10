import { stableStringify } from "./canonicalize";
import { hex32 } from "./hash";

export interface MerkleLeaf {
  field: string;
  value: unknown;
  leafHash: `0x${string}`;
}

export interface MerkleProof {
  field: string;
  value: unknown;
  leafHash: `0x${string}`;
  index: number;
  siblings: `0x${string}`[];
}

function hashPair(left: `0x${string}`, right: `0x${string}`): `0x${string}` {
  return hex32(`${left}:${right}`);
}

export function leafHash(field: string, value: unknown): `0x${string}` {
  return hex32(stableStringify({ field, value }));
}

export function buildLeaves(fields: Record<string, unknown>): MerkleLeaf[] {
  return Object.keys(fields)
    .sort()
    .map((field) => ({ field, value: fields[field], leafHash: leafHash(field, fields[field]) }));
}

export function merkleRootFromLeaves(leaves: MerkleLeaf[]): `0x${string}` {
  if (leaves.length === 0) {
    return hex32("merkle:empty");
  }

  let level = leaves.map((leaf) => leaf.leafHash);
  while (level.length > 1) {
    const next: `0x${string}`[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(hashPair(left, right));
    }
    level = next;
  }

  return level[0];
}

export function merkleRoot(fields: Record<string, unknown>): `0x${string}` {
  return merkleRootFromLeaves(buildLeaves(fields));
}

export function merkleProof(fields: Record<string, unknown>, field: string): MerkleProof {
  const leaves = buildLeaves(fields);
  const index = leaves.findIndex((leaf) => leaf.field === field);
  if (index === -1) {
    throw new Error(`unknown field: ${field}`);
  }

  const siblings: `0x${string}`[] = [];
  let position = index;
  let level = leaves.map((leaf) => leaf.leafHash);

  while (level.length > 1) {
    const siblingIndex = position % 2 === 0 ? position + 1 : position - 1;
    siblings.push(level[siblingIndex] ?? level[position]);

    const next: `0x${string}`[] = [];
    for (let levelIndex = 0; levelIndex < level.length; levelIndex += 2) {
      const left = level[levelIndex];
      const right = level[levelIndex + 1] ?? left;
      next.push(hashPair(left, right));
    }

    level = next;
    position = Math.floor(position / 2);
  }

  return {
    field,
    value: fields[field],
    leafHash: leaves[index].leafHash,
    index,
    siblings
  };
}

export function verifyMerkleProof(root: `0x${string}`, proof: MerkleProof): boolean {
  let current = proof.leafHash;
  let position = proof.index;
  for (const sibling of proof.siblings) {
    current = position % 2 === 0 ? hashPair(current, sibling) : hashPair(sibling, current);
    position = Math.floor(position / 2);
  }
  return current === root && proof.leafHash === leafHash(proof.field, proof.value);
}
