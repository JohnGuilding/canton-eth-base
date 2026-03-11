// BN128 scalar field prime
const BN128_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Converts a bytes32 hex string to a BN128 field element (mod p).
 */
export function toFieldElement(bytes32hex: string): bigint {
  const raw = BigInt(bytes32hex);
  return raw % BN128_PRIME;
}

/**
 * Builds a Poseidon Merkle tree from elements using circomlibjs.
 * Returns root and a getProof function for any leaf index.
 */
export async function buildPoseidonMerkleTree(elements: bigint[], depth: number): Promise<{
  root: bigint;
  getProof: (index: number) => { pathElements: bigint[]; pathIndices: number[] };
}> {
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();

  const F = poseidon.F;

  function poseidonHash(inputs: bigint[]): bigint {
    return F.toObject(poseidon(inputs.map((x) => F.e(x))));
  }

  // Hash each leaf: Poseidon(element)
  const numLeaves = 1 << depth;
  const leaves: bigint[] = new Array(numLeaves).fill(0n);
  for (let i = 0; i < elements.length; i++) {
    leaves[i] = poseidonHash([elements[i]]);
  }

  // Build tree bottom-up
  const tree: bigint[][] = [leaves];
  for (let level = 0; level < depth; level++) {
    const prev = tree[level];
    const next: bigint[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(poseidonHash([prev[i], prev[i + 1]]));
    }
    tree.push(next);
  }

  const root = tree[depth][0];

  function getProof(index: number): { pathElements: bigint[]; pathIndices: number[] } {
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let idx = index;
    for (let level = 0; level < depth; level++) {
      const siblingIdx = idx ^ 1;
      pathElements.push(tree[level][siblingIdx]);
      pathIndices.push(idx & 1);
      idx >>= 1;
    }
    return { pathElements, pathIndices };
  }

  return { root, getProof };
}

/**
 * Computes Poseidon hash using circomlibjs (matches circuit Poseidon).
 */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  return F.toObject(poseidon(inputs.map((x) => F.e(x))));
}
