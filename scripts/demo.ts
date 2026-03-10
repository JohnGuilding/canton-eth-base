import { ethers } from "hardhat";
import policy from "../config/policy.trade.json";
import { buildBundleManifest, decryptBundleForRecipient, recipientsFromKeyPairs, TradePrivateFields } from "../sdk/bundles";
import { buildDisclosurePackage, verifyDisclosurePackage } from "../sdk/disclosure";
import { generateRecipientKeyPair } from "../sdk/crypto";
import { buildAvailabilityMetadata } from "../sdk/payload";
import { computeComplianceRoot, computeFieldRoot, computePolicyHash, computeStakeholderRoot } from "../sdk/roots";
import { hex32 } from "../sdk/hash";

function id(label: string): `0x${string}` {
  return ethers.id(label) as `0x${string}`;
}

async function main() {
  const [, aAdmin, bAdmin, cAdmin, rAdmin, treasury] = await ethers.getSigners();

  const InstitutionRegistry = await ethers.getContractFactory("InstitutionRegistry");
  const TradeRegistry = await ethers.getContractFactory("TradeRegistry");
  const DisclosureRegistry = await ethers.getContractFactory("DisclosureRegistry");
  const ComplianceRegistry = await ethers.getContractFactory("ComplianceRegistry");
  const PayloadRegistry = await ethers.getContractFactory("PayloadRegistry");
  const EscrowAdapter = await ethers.getContractFactory("EscrowAdapter");
  const CashSettlementAdapter = await ethers.getContractFactory("CashSettlementAdapter");

  const institutionRegistry = await InstitutionRegistry.deploy();
  const tradeRegistry = await TradeRegistry.deploy();
  const disclosureRegistry = await DisclosureRegistry.deploy();
  const complianceRegistry = await ComplianceRegistry.deploy();
  const payloadRegistry = await PayloadRegistry.deploy();
  const escrowAdapter = await EscrowAdapter.deploy();
  const cashSettlementAdapter = await CashSettlementAdapter.deploy();

  await Promise.all([
    institutionRegistry.waitForDeployment(),
    tradeRegistry.waitForDeployment(),
    disclosureRegistry.waitForDeployment(),
    complianceRegistry.waitForDeployment(),
    payloadRegistry.waitForDeployment(),
    escrowAdapter.waitForDeployment(),
    cashSettlementAdapter.waitForDeployment()
  ]);

  const institutions = [
    { code: "A", name: "Alpha Bank", role: 1, admin: aAdmin.address },
    { code: "B", name: "Beta Capital", role: 1, admin: bAdmin.address },
    { code: "C", name: "ClearServ Ops", role: 1, admin: cAdmin.address },
    { code: "R", name: "Regulator R", role: 2, admin: rAdmin.address }
  ] as const;

  for (const entry of institutions) {
    await (await institutionRegistry.registerInstitution(
      id(`institution:${entry.code}`),
      entry.code,
      entry.name,
      entry.role,
      entry.admin,
      id(`meta:${entry.code}`)
    )).wait();
  }

  const objectId = id("trade:T-001");
  const schemaId = id("schema:trade:v1");
  const settlementRef = id("settlement:T-001");
  const privateFields: TradePrivateFields = {
    x: "Exposure leg details visible to A, B, and regulator under policy P",
    y: "Shared economics visible to A, B, C, and regulator for reporting scope",
    z: "Internal structuring detail visible only to A",
    pricingDetails: { fixedRateBps: 275, tenorDays: 30, valuationModel: "base-demo-v2" },
    counterpartyMetadata: { lei: "5493001KJTIIGC8Y1R12", domicile: "GB" },
    internalRiskNotes: "Desk-level concentration exception approved for MVP flow"
  };

  const keyPairs = {
    A: { ...generateRecipientKeyPair("A:desk"), institutionId: id("institution:A") },
    B: { ...generateRecipientKeyPair("B:desk"), institutionId: id("institution:B") },
    C: { ...generateRecipientKeyPair("C:ops"), institutionId: id("institution:C") },
    R: { ...generateRecipientKeyPair("R:supervisor"), institutionId: id("institution:R") }
  };

  const stakeholderSet = {
    A: { institutionId: id("institution:A"), bundles: ["partyA.full"], recipientKey: keyPairs.A.publicKey },
    B: { institutionId: id("institution:B"), bundles: ["partyB.shared"], recipientKey: keyPairs.B.publicKey },
    C: { institutionId: id("institution:C"), bundles: ["partyC.min"], recipientKey: keyPairs.C.publicKey },
    R: { institutionId: id("institution:R"), bundles: ["regulator.disclosure"], policyRef: "P", lawfulScope: ["x", "y"], recipientKey: keyPairs.R.publicKey }
  };

  const policyHash = computePolicyHash(policy);
  const stakeholderRoot = computeStakeholderRoot(stakeholderSet as Record<string, unknown>);
  const fieldRoot = computeFieldRoot(privateFields as unknown as Record<string, unknown>);
  const complianceRootV1 = computeComplianceRoot([]);

  await (await tradeRegistry.createTrade({
    objectId,
    schemaId,
    version: 1,
    parentVersionHash: ethers.ZeroHash,
    lifecycleState: 0,
    stakeholderRoot,
    policyHash,
    fieldRoot,
    complianceRoot: complianceRootV1,
    revocationEpoch: 0,
    settlementRef: ethers.ZeroHash,
    settlementStatus: 0,
    productType: "OTC_SWAP",
    notionalBucket: "1m-5m"
  })).wait();

  const bundleA = buildBundleManifest(objectId, "partyA.full", privateFields, recipientsFromKeyPairs([keyPairs.A]), "ipfs://trade-bundles");
  const bundleB = buildBundleManifest(objectId, "partyB.shared", privateFields, recipientsFromKeyPairs([keyPairs.B]), "ipfs://trade-bundles");
  const bundleC = buildBundleManifest(objectId, "partyC.min", privateFields, recipientsFromKeyPairs([keyPairs.C]), "ipfs://trade-bundles");
  const bundleR = buildBundleManifest(objectId, "regulator.disclosure", privateFields, recipientsFromKeyPairs([keyPairs.R]), "ipfs://trade-bundles");

  for (const bundle of [bundleA, bundleB, bundleC, bundleR]) {
    const availability = buildAvailabilityMetadata(bundle, policyHash);
    await (await payloadRegistry.recordPayloadAvailability(
      objectId,
      bundle.manifest.payloadHash,
      bundle.manifest.manifestHash,
      bundle.manifest.fieldRoot,
      policyHash,
      availability.uri,
      availability.availabilityClass,
      availability.bundleClass
    )).wait();
  }

  await (await tradeRegistry.transitionLifecycle(objectId, 1)).wait();
  await (await tradeRegistry.transitionLifecycle(objectId, 2)).wait();

  const proofId = id("proof:notional-bucket:T-001:v1");
  const assertionHash = hex32(JSON.stringify({ rule: "limit-check-notional-lte-bucket", bucket: "1m-5m", result: true }));
  const proofHash = hex32(JSON.stringify({ proofSystem: "attested-hash", attestor: "risk-engine-v1", result: true }));
  const complianceEntries = [{ proofId, assertionHash, proofHash, proofOnly: true, proofType: "attested-hash" }];
  await (await complianceRegistry.recordProof(objectId, proofId, "attested-hash", assertionHash, proofHash, true)).wait();

  await (await tradeRegistry.versionTrade(
    objectId,
    2,
    hex32("trade:T-001:v1"),
    fieldRoot,
    stakeholderRoot,
    computeComplianceRoot(complianceEntries),
    "OTC_SWAP",
    "1m-5m"
  )).wait();

  await (await tradeRegistry.transitionLifecycle(objectId, 3)).wait();
  await (await tradeRegistry.bindSettlement(objectId, settlementRef, 1)).wait();

  const escrowId = id("escrow:T-001");
  await (await escrowAdapter.connect(aAdmin).fundEscrow(objectId, escrowId, { value: ethers.parseEther("1.0") })).wait();
  await (await escrowAdapter.releaseEscrow(escrowId, treasury.address)).wait();

  const regulatorView = decryptBundleForRecipient<{ x: string; y: string }>(bundleR, keyPairs.R);
  const disclosurePackage = buildDisclosurePackage({
    objectId,
    policyName: policy.name,
    policyHash,
    lawfulBasis: "Regulatory inquiry under policy P / lawful basis LB-2026-BASE-1",
    recipientInstitutionCode: "R",
    bundle: bundleR.manifest,
    privateFields,
    fieldsDisclosed: ["x", "y"],
    note: "Regulator package includes plaintext x/y with Merkle proofs and a receipt workflow"
  });

  if (!verifyDisclosurePackage(disclosurePackage)) {
    throw new Error("disclosure package verification failed");
  }

  await (await disclosureRegistry.recordDisclosure(
    objectId,
    disclosurePackage.disclosureId,
    id("institution:R"),
    bundleR.manifest.payloadHash,
    disclosurePackage.packageHash,
    bundleR.manifest.fieldRoot,
    policyHash,
    bundleR.manifest.manifestHash,
    disclosurePackage.disclosedFieldsRoot,
    bundleR.manifest.bundleClass,
    disclosurePackage.payload.lawfulBasis,
    disclosurePackage.payload.note
  )).wait();

  await (await disclosureRegistry.recordReceipt(
    disclosurePackage.disclosureId,
    hex32("receipt:regulator:R:T-001"),
    "ipfs://receipts/r-t-001.json"
  )).wait();

  await (await cashSettlementAdapter.markSettlement(
    objectId,
    settlementRef,
    2,
    "BASE_RTGS_MOCK",
    hex32("cash-ref:T-001:confirmed")
  )).wait();

  await (await tradeRegistry.completeSettlement(objectId, 3)).wait();
  await (await tradeRegistry.transitionLifecycle(objectId, 4)).wait();
  await (await tradeRegistry.transitionLifecycle(objectId, 5)).wait();
  await (await tradeRegistry.advanceRevocationEpoch(objectId)).wait();

  const trade = await tradeRegistry.trades(objectId);
  const payloadRecord = await payloadRegistry.payloads(bundleR.manifest.payloadHash);
  const disclosureRecord = await disclosureRegistry.disclosures(disclosurePackage.disclosureId);

  console.log("=== Prototype B Demo Complete ===");
  console.log("Contracts:", {
    institutionRegistry: await institutionRegistry.getAddress(),
    tradeRegistry: await tradeRegistry.getAddress(),
    disclosureRegistry: await disclosureRegistry.getAddress(),
    complianceRegistry: await complianceRegistry.getAddress(),
    payloadRegistry: await payloadRegistry.getAddress(),
    escrowAdapter: await escrowAdapter.getAddress(),
    cashSettlementAdapter: await cashSettlementAdapter.getAddress()
  });
  console.log("Bundle field root:", fieldRoot);
  console.log("Regulator decrypted bundle:", regulatorView);
  console.log("Payload record:", payloadRecord);
  console.log("Disclosure record:", disclosureRecord);
  console.log("Final trade header:", trade);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
