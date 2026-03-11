import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { hex32 } from "./hash";
import { toFieldElement } from "./zk-utils";

const ROOT = join(__dirname, "..");
const CIRCUITS_DIR = join(ROOT, "zk", "circuits");
const BUILD_DIR = join(ROOT, "zk", "build");
const NODE_MODULES = join(ROOT, "node_modules");

const PTAU_POWER = 12;

export interface Groth16Proof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
  verified: boolean;
  proofHash: `0x${string}`;
}

function ensurePtau(): string {
  const ptauDir = join(BUILD_DIR, "ptau");
  mkdirSync(ptauDir, { recursive: true });
  const ptau0 = join(ptauDir, `pot${PTAU_POWER}_0000.ptau`);
  const ptau1 = join(ptauDir, `pot${PTAU_POWER}_0001.ptau`);
  const ptauFinal = join(ptauDir, `pot${PTAU_POWER}_final.ptau`);

  if (existsSync(ptauFinal)) return ptauFinal;

  if (!existsSync(ptau0)) {
    execFileSync("npx", ["--yes", "snarkjs", "powersoftau", "new", "bn128", String(PTAU_POWER), ptau0, "-v"], { stdio: "inherit" });
  }
  if (!existsSync(ptau1)) {
    execFileSync("npx", ["--yes", "snarkjs", "powersoftau", "contribute", ptau0, ptau1, "--name=canton-base-ceremony", "-e=canton-base-deterministic-entropy"], { stdio: "inherit" });
  }
  if (!existsSync(ptauFinal)) {
    execFileSync("npx", ["--yes", "snarkjs", "powersoftau", "prepare", "phase2", ptau1, ptauFinal, "-v"], { stdio: "inherit" });
  }
  return ptauFinal;
}

/**
 * Ensures circuit artifacts exist for a given circuit name.
 * Compiles the circuit and runs setup if artifacts are missing.
 */
export function ensureCircuitArtifacts(circuitName: string): {
  wasm: string;
  zkey: string;
  vkey: string;
} {
  const outDir = join(BUILD_DIR, circuitName);
  const wasm = join(outDir, `${circuitName}_js`, `${circuitName}.wasm`);
  const r1cs = join(outDir, `${circuitName}.r1cs`);
  const zkey0 = join(outDir, `${circuitName}_0000.zkey`);
  const zkeyFinal = join(outDir, `${circuitName}_final.zkey`);
  const vkey = join(outDir, "verification_key.json");

  if (existsSync(wasm) && existsSync(zkeyFinal) && existsSync(vkey)) {
    return { wasm, zkey: zkeyFinal, vkey };
  }

  mkdirSync(outDir, { recursive: true });

  const circuitSrc = join(CIRCUITS_DIR, `${circuitName}.circom`);

  if (!existsSync(r1cs)) {
    execFileSync("circom", [circuitSrc, "--r1cs", "--wasm", "--sym", "-o", outDir, "-l", NODE_MODULES], { stdio: "inherit" });
  }

  const ptauPath = ensurePtau();

  if (!existsSync(zkey0)) {
    execFileSync("npx", ["--yes", "snarkjs", "groth16", "setup", r1cs, ptauPath, zkey0], { stdio: "inherit" });
  }
  if (!existsSync(zkeyFinal)) {
    execFileSync("npx", ["--yes", "snarkjs", "zkey", "contribute", zkey0, zkeyFinal, `--name=${circuitName}-contrib`, `-e=${circuitName}-deterministic-entropy`], { stdio: "inherit" });
  }
  if (!existsSync(vkey)) {
    execFileSync("npx", ["--yes", "snarkjs", "zkey", "export", "verificationkey", zkeyFinal, vkey], { stdio: "inherit" });
  }

  return { wasm, zkey: zkeyFinal, vkey };
}

async function prove(circuitName: string, input: Record<string, unknown>): Promise<Groth16Proof> {
  const { wasm, zkey, vkey } = ensureCircuitArtifacts(circuitName);
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  const vkeyData = JSON.parse(readFileSync(vkey, "utf8"));
  const verified = await snarkjs.groth16.verify(vkeyData, publicSignals, proof);
  return {
    proof,
    publicSignals,
    verified,
    proofHash: hex32(JSON.stringify({ publicSignals, proof })),
  };
}

export async function proveRangeCheck(params: {
  objectId: string;
  version: number;
  limit: bigint;
  value: bigint;
}): Promise<Groth16Proof> {
  return prove("range-check", {
    objectId: toFieldElement(params.objectId).toString(),
    version: params.version.toString(),
    limit: params.limit.toString(),
    value: params.value.toString(),
  });
}

export async function proveSetMembership(params: {
  objectId: string;
  version: number;
  setRoot: bigint;
  element: bigint;
  pathElements: bigint[];
  pathIndices: number[];
}): Promise<Groth16Proof> {
  return prove("set-membership", {
    objectId: toFieldElement(params.objectId).toString(),
    version: params.version.toString(),
    setRoot: params.setRoot.toString(),
    element: params.element.toString(),
    pathElements: params.pathElements.map((e) => e.toString()),
    pathIndices: params.pathIndices.map((i) => i.toString()),
  });
}

export async function proveApprovalExists(params: {
  objectId: string;
  version: number;
  approvalHash: bigint;
  approvalSecret: bigint;
}): Promise<Groth16Proof> {
  return prove("approval-exists", {
    objectId: toFieldElement(params.objectId).toString(),
    version: params.version.toString(),
    approvalHash: params.approvalHash.toString(),
    approvalSecret: params.approvalSecret.toString(),
  });
}

export async function proveDeadlineCheck(params: {
  objectId: string;
  version: number;
  deadline: bigint;
  completionTime: bigint;
}): Promise<Groth16Proof> {
  return prove("deadline-check", {
    objectId: toFieldElement(params.objectId).toString(),
    version: params.version.toString(),
    deadline: params.deadline.toString(),
    completionTime: params.completionTime.toString(),
  });
}

/**
 * Formats a snarkjs proof + public signals into Solidity calldata for onchain verification.
 */
export async function proofToSolidityCalldata(
  proof: Groth16Proof["proof"],
  publicSignals: string[]
): Promise<{
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  pubSignals: string[];
}> {
  const snarkjs = await import("snarkjs");
  const rawCalldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  // rawCalldata is a string like: ["0x...","0x..."],[[...],[...]],["0x...","0x..."],[...]
  const parsed = JSON.parse(`[${rawCalldata}]`);
  return {
    pA: parsed[0] as [string, string],
    pB: parsed[1] as [[string, string], [string, string]],
    pC: parsed[2] as [string, string],
    pubSignals: parsed[3] as string[],
  };
}
