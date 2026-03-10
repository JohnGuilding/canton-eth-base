import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import snarkjs from "snarkjs";
import { hex32 } from "./hash";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ZK_DIR = join(ROOT, "zk", "approval-exists");
const CIRCUIT_WASM = join(ZK_DIR, "circuit.wasm");
const CIRCUIT_R1CS = join(ZK_DIR, "circuit.r1cs");
const CIRCUIT_SRC = join(ZK_DIR, "circuit.circom");
const PTAU0 = join(ZK_DIR, "pot8_0000.ptau");
const PTAU1 = join(ZK_DIR, "pot8_final.ptau");
const ZKEY = join(ZK_DIR, "approval_exists_final.zkey");
const VKEY = join(ZK_DIR, "verification_key.json");

const downloads: Record<string, string> = {
  [CIRCUIT_SRC]: "https://raw.githubusercontent.com/iden3/snarkjs/master/test/groth16/circuit.circom",
  [CIRCUIT_R1CS]: "https://raw.githubusercontent.com/iden3/snarkjs/master/test/groth16/circuit.r1cs",
  [CIRCUIT_WASM]: "https://raw.githubusercontent.com/iden3/snarkjs/master/test/groth16/circuit.wasm"
};

function curl(url: string, out: string) {
  execFileSync("curl", ["-L", "-sS", url, "-o", out], { stdio: "inherit" });
}

export function ensureGroth16Artifacts(): void {
  mkdirSync(ZK_DIR, { recursive: true });
  for (const [target, url] of Object.entries(downloads)) {
    if (!existsSync(target)) {
      curl(url, target);
    }
  }
  if (!existsSync(PTAU0)) {
    execFileSync("npx", ["--yes", "snarkjs", "powersoftau", "new", "bn128", "8", PTAU0, "-v"], { stdio: "inherit" });
  }
  if (!existsSync(PTAU1)) {
    execFileSync("npx", ["--yes", "snarkjs", "powersoftau", "contribute", PTAU0, PTAU1, "--name=approval-exists", "-e=hackathon-seed"], { stdio: "inherit" });
  }
  if (!existsSync(ZKEY)) {
    execFileSync("npx", ["--yes", "snarkjs", "groth16", "setup", CIRCUIT_R1CS, PTAU1, ZKEY], { stdio: "inherit" });
  }
  if (!existsSync(VKEY)) {
    execFileSync("npx", ["--yes", "snarkjs", "zkey", "export", "verificationkey", ZKEY, VKEY], { stdio: "inherit" });
  }
}

export interface ApprovalExistsProof {
  publicSignals: string[];
  proof: unknown;
  verified: boolean;
  proofHash: `0x${string}`;
}

export async function proveDualApprovalExists(a: number, b: number): Promise<ApprovalExistsProof> {
  ensureGroth16Artifacts();
  const input = { a, b };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, CIRCUIT_WASM, ZKEY);
  const vkey = JSON.parse(readFileSync(VKEY, "utf8"));
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  writeFileSync(join(ZK_DIR, "last_input.json"), JSON.stringify(input, null, 2));
  writeFileSync(join(ZK_DIR, "last_public.json"), JSON.stringify(publicSignals, null, 2));
  writeFileSync(join(ZK_DIR, "last_proof.json"), JSON.stringify(proof, null, 2));
  return {
    publicSignals,
    proof,
    verified,
    proofHash: hex32(JSON.stringify({ publicSignals, proof }))
  };
}
