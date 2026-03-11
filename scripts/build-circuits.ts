import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const CIRCUITS_DIR = join(ROOT, "zk", "circuits");
const BUILD_DIR = join(ROOT, "zk", "build");
const VERIFIERS_DIR = join(ROOT, "contracts", "verifiers");
const NODE_MODULES = join(ROOT, "node_modules");

const CIRCUITS = [
  { name: "range-check", contractName: "RangeCheckVerifier" },
  { name: "set-membership", contractName: "SetMembershipVerifier" },
  { name: "approval-exists", contractName: "ApprovalExistsVerifier" },
  { name: "deadline-check", contractName: "DeadlineCheckVerifier" },
];

const PTAU_POWER = 12;

function run(cmd: string, args: string[], opts?: { cwd?: string }) {
  console.log(`  $ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function npxSnarkjs(...args: string[]) {
  run("npx", ["--yes", "snarkjs", ...args]);
}

function ensurePtau(): string {
  const ptauDir = join(BUILD_DIR, "ptau");
  mkdirSync(ptauDir, { recursive: true });

  const ptau0 = join(ptauDir, `pot${PTAU_POWER}_0000.ptau`);
  const ptau1 = join(ptauDir, `pot${PTAU_POWER}_0001.ptau`);
  const ptauFinal = join(ptauDir, `pot${PTAU_POWER}_final.ptau`);

  if (existsSync(ptauFinal)) {
    console.log("  ptau already exists, skipping");
    return ptauFinal;
  }

  console.log("\n=== Generating shared Powers of Tau ===");
  if (!existsSync(ptau0)) {
    npxSnarkjs("powersoftau", "new", "bn128", String(PTAU_POWER), ptau0, "-v");
  }
  if (!existsSync(ptau1)) {
    npxSnarkjs("powersoftau", "contribute", ptau0, ptau1, "--name=canton-base-ceremony", "-e=canton-base-deterministic-entropy");
  }
  if (!existsSync(ptauFinal)) {
    npxSnarkjs("powersoftau", "prepare", "phase2", ptau1, ptauFinal, "-v");
  }
  return ptauFinal;
}

function buildCircuit(circuitName: string, contractName: string, ptauPath: string) {
  console.log(`\n=== Building circuit: ${circuitName} ===`);

  const circuitSrc = join(CIRCUITS_DIR, `${circuitName}.circom`);
  const outDir = join(BUILD_DIR, circuitName);
  mkdirSync(outDir, { recursive: true });

  const r1cs = join(outDir, `${circuitName}.r1cs`);
  const wasm = join(outDir, `${circuitName}_js`, `${circuitName}.wasm`);
  const zkey0 = join(outDir, `${circuitName}_0000.zkey`);
  const zkeyFinal = join(outDir, `${circuitName}_final.zkey`);
  const vkey = join(outDir, "verification_key.json");
  const verifierSol = join(outDir, "verifier.sol");

  // 1. Compile circom
  if (!existsSync(r1cs)) {
    console.log("  Compiling circom...");
    run("circom", [circuitSrc, "--r1cs", "--wasm", "--sym", "-o", outDir, "-l", NODE_MODULES]);
  }

  // 2. Groth16 setup
  if (!existsSync(zkey0)) {
    console.log("  Running groth16 setup...");
    npxSnarkjs("groth16", "setup", r1cs, ptauPath, zkey0);
  }

  // 3. Contribute to zkey
  if (!existsSync(zkeyFinal)) {
    console.log("  Contributing to zkey...");
    npxSnarkjs("zkey", "contribute", zkey0, zkeyFinal, `--name=${circuitName}-contrib`, `-e=${circuitName}-deterministic-entropy`);
  }

  // 4. Export verification key
  if (!existsSync(vkey)) {
    console.log("  Exporting verification key...");
    npxSnarkjs("zkey", "export", "verificationkey", zkeyFinal, vkey);
  }

  // 5. Export Solidity verifier
  if (!existsSync(verifierSol)) {
    console.log("  Exporting Solidity verifier...");
    npxSnarkjs("zkey", "export", "solidityverifier", zkeyFinal, verifierSol);
  }

  // 6. Copy and rename verifier to contracts/verifiers/
  const destSol = join(VERIFIERS_DIR, `${contractName}.sol`);
  if (!existsSync(destSol)) {
    console.log(`  Copying verifier as ${contractName}.sol...`);
    let src = readFileSync(verifierSol, "utf8");
    // Rename the contract from Groth16Verifier to the specific name
    src = src.replace(/contract Groth16Verifier/g, `contract ${contractName}`);
    writeFileSync(destSol, src);
  }

  console.log(`  Done: ${circuitName}`);
}

async function main() {
  console.log("Building all ZK circuits...\n");
  mkdirSync(VERIFIERS_DIR, { recursive: true });

  const ptauPath = ensurePtau();

  for (const circuit of CIRCUITS) {
    buildCircuit(circuit.name, circuit.contractName, ptauPath);
  }

  console.log("\n=== All circuits built successfully ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
