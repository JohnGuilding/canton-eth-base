import { expect } from "chai";
import { ethers } from "hardhat";
import {
  ensureCircuitArtifacts,
  proveRangeCheck,
  proveSetMembership,
  proveApprovalExists,
  proveDeadlineCheck,
  proofToSolidityCalldata,
  Groth16Proof,
} from "../sdk/zk";
import { buildPoseidonMerkleTree, poseidonHash, toFieldElement } from "../sdk/zk-utils";

describe("ZK Proof Integration", function () {
  this.timeout(300_000);

  let complianceRegistry: any;
  let router: any;
  let rangeCheckVerifier: any;
  let setMembershipVerifier: any;
  let approvalExistsVerifier: any;
  let deadlineCheckVerifier: any;
  let owner: any;

  const objectId = ethers.id("trade:zk-test");
  const version = 1;

  before(async function () {
    [owner] = await ethers.getSigners();

    // Ensure all circuit artifacts are compiled
    console.log("    Ensuring circuit artifacts...");
    ensureCircuitArtifacts("range-check");
    ensureCircuitArtifacts("set-membership");
    ensureCircuitArtifacts("approval-exists");
    ensureCircuitArtifacts("deadline-check");

    // Deploy ComplianceRegistry
    const ComplianceRegistry = await ethers.getContractFactory("ComplianceRegistry");
    complianceRegistry = await ComplianceRegistry.deploy();
    await complianceRegistry.waitForDeployment();

    // Deploy verifiers
    const RangeCheck = await ethers.getContractFactory("RangeCheckVerifier");
    rangeCheckVerifier = await RangeCheck.deploy();
    await rangeCheckVerifier.waitForDeployment();

    const SetMembership = await ethers.getContractFactory("SetMembershipVerifier");
    setMembershipVerifier = await SetMembership.deploy();
    await setMembershipVerifier.waitForDeployment();

    const ApprovalExists = await ethers.getContractFactory("ApprovalExistsVerifier");
    approvalExistsVerifier = await ApprovalExists.deploy();
    await approvalExistsVerifier.waitForDeployment();

    const DeadlineCheck = await ethers.getContractFactory("DeadlineCheckVerifier");
    deadlineCheckVerifier = await DeadlineCheck.deploy();
    await deadlineCheckVerifier.waitForDeployment();

    // Deploy router
    const Router = await ethers.getContractFactory("ProofVerifierRouter");
    router = await Router.deploy(await complianceRegistry.getAddress());
    await router.waitForDeployment();

    // Authorize router in ComplianceRegistry
    await (await complianceRegistry.authorize(await router.getAddress())).wait();

    // Register verifiers
    await (await router.registerVerifier("range-check", await rangeCheckVerifier.getAddress())).wait();
    await (await router.registerVerifier("set-membership", await setMembershipVerifier.getAddress())).wait();
    await (await router.registerVerifier("approval-exists", await approvalExistsVerifier.getAddress())).wait();
    await (await router.registerVerifier("deadline-check", await deadlineCheckVerifier.getAddress())).wait();
  });

  async function encodeVerifierCalldata4(proof: Groth16Proof): Promise<string> {
    const { pA, pB, pC, pubSignals } = await proofToSolidityCalldata(proof.proof, proof.publicSignals);
    const iface = new ethers.Interface([
      "function verifyProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[4] _pubSignals) view returns (bool)",
    ]);
    return iface.encodeFunctionData("verifyProof", [pA, pB, pC, pubSignals]);
  }

  async function encodeVerifierCalldata3(proof: Groth16Proof): Promise<string> {
    const { pA, pB, pC, pubSignals } = await proofToSolidityCalldata(proof.proof, proof.publicSignals);
    const iface = new ethers.Interface([
      "function verifyProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[3] _pubSignals) view returns (bool)",
    ]);
    return iface.encodeFunctionData("verifyProof", [pA, pB, pC, pubSignals]);
  }

  it("range-check: proves value <= limit and verifies onchain", async function () {
    const value = 500n;
    const limit = 1000n;

    const proof = await proveRangeCheck({ objectId, version, limit, value });
    expect(proof.verified).to.equal(true);

    const proofId = ethers.id("range-check-proof-1");
    const calldata = await encodeVerifierCalldata4(proof);

    await expect(
      router.verifyAndRecord(objectId, proofId, "range-check", calldata, proof.proofHash)
    ).to.emit(router, "ProofVerifiedAndRecorded");

    const stored = await complianceRegistry.proofs(proofId);
    expect(stored.objectId).to.equal(objectId);
    expect(stored.proofOnly).to.equal(true);
  });

  it("set-membership: proves counterparty in approved set and verifies onchain", async function () {
    // Build a set of 4 counterparty IDs
    const counterparties = [
      toFieldElement(ethers.id("counterparty:alpha")),
      toFieldElement(ethers.id("counterparty:beta")),
      toFieldElement(ethers.id("counterparty:gamma")),
      toFieldElement(ethers.id("counterparty:delta")),
    ];

    const depth = 4;
    const tree = await buildPoseidonMerkleTree(counterparties, depth);

    // Prove membership of counterparty at index 1 (beta)
    const memberIndex = 1;
    const memberProof = tree.getProof(memberIndex);

    const proof = await proveSetMembership({
      objectId,
      version,
      setRoot: tree.root,
      element: counterparties[memberIndex],
      pathElements: memberProof.pathElements,
      pathIndices: memberProof.pathIndices,
    });
    expect(proof.verified).to.equal(true);

    const proofId = ethers.id("set-membership-proof-1");
    const calldata = await encodeVerifierCalldata3(proof);

    await expect(
      router.verifyAndRecord(objectId, proofId, "set-membership", calldata, proof.proofHash)
    ).to.emit(router, "ProofVerifiedAndRecorded");

    const stored = await complianceRegistry.proofs(proofId);
    expect(stored.objectId).to.equal(objectId);
    expect(stored.proofOnly).to.equal(true);
  });

  it("approval-exists: proves custodian approval exists and verifies onchain", async function () {
    const approvalSecret = 42n;
    const objFieldElem = toFieldElement(objectId);

    // Compute approvalHash = Poseidon(objectId, version, approvalSecret)
    const approvalHash = await poseidonHash([objFieldElem, BigInt(version), approvalSecret]);

    const proof = await proveApprovalExists({
      objectId,
      version,
      approvalHash,
      approvalSecret,
    });
    expect(proof.verified).to.equal(true);

    const proofId = ethers.id("approval-exists-proof-1");
    const calldata = await encodeVerifierCalldata3(proof);

    await expect(
      router.verifyAndRecord(objectId, proofId, "approval-exists", calldata, proof.proofHash)
    ).to.emit(router, "ProofVerifiedAndRecorded");

    const stored = await complianceRegistry.proofs(proofId);
    expect(stored.objectId).to.equal(objectId);
    expect(stored.proofOnly).to.equal(true);
  });

  it("deadline-check: proves settlement before deadline and verifies onchain", async function () {
    const completionTime = 1700000000n;
    const deadline = 1700100000n;

    const proof = await proveDeadlineCheck({
      objectId,
      version,
      deadline,
      completionTime,
    });
    expect(proof.verified).to.equal(true);

    const proofId = ethers.id("deadline-check-proof-1");
    const calldata = await encodeVerifierCalldata4(proof);

    await expect(
      router.verifyAndRecord(objectId, proofId, "deadline-check", calldata, proof.proofHash)
    ).to.emit(router, "ProofVerifiedAndRecorded");

    const stored = await complianceRegistry.proofs(proofId);
    expect(stored.objectId).to.equal(objectId);
    expect(stored.proofOnly).to.equal(true);
  });

  it("rejects tampered proof onchain", async function () {
    const value = 500n;
    const limit = 1000n;

    const proof = await proveRangeCheck({ objectId, version, limit, value });
    expect(proof.verified).to.equal(true);

    // Tamper with proof: modify pA
    const { pA, pB, pC, pubSignals } = await proofToSolidityCalldata(proof.proof, proof.publicSignals);
    // Flip a bit in pA[0]
    const tamperedPA: [string, string] = [
      (BigInt(pA[0]) ^ 1n).toString(),
      pA[1],
    ];

    const iface = new ethers.Interface([
      "function verifyProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[4] _pubSignals) view returns (bool)",
    ]);
    const tamperedCalldata = iface.encodeFunctionData("verifyProof", [tamperedPA, pB, pC, pubSignals]);

    const proofId = ethers.id("tampered-proof-1");

    await expect(
      router.verifyAndRecord(objectId, proofId, "range-check", tamperedCalldata, proof.proofHash)
    ).to.be.reverted;
  });

  it("ProofConsumer accepts ZK-verified compliance records", async function () {
    // Generate and verify a proof
    const value = 100n;
    const limit = 200n;

    const proof = await proveRangeCheck({ objectId, version, limit, value });
    expect(proof.verified).to.equal(true);

    const proofId = ethers.id("consumer-test-proof-1");
    const calldata = await encodeVerifierCalldata4(proof);

    await (await router.verifyAndRecord(objectId, proofId, "range-check", calldata, proof.proofHash)).wait();

    // Deploy ProofConsumer
    const ProofConsumer = await ethers.getContractFactory("ProofConsumer");
    const consumer = await ProofConsumer.deploy(await complianceRegistry.getAddress());
    await consumer.waitForDeployment();

    // Consumer should accept the ZK-verified proof
    const stored = await complianceRegistry.proofs(proofId);
    await expect(
      consumer.acceptProof(objectId, proofId, stored.proofHash)
    ).to.emit(consumer, "ProofAccepted");

    expect(await consumer.acceptedProofs(proofId)).to.equal(true);
  });
});
