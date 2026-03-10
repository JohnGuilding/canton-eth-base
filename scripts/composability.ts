import { ethers } from "hardhat";

function id(label: string): `0x${string}` {
  return ethers.id(label) as `0x${string}`;
}

async function main() {
  const ComplianceRegistry = await ethers.getContractFactory("ComplianceRegistry");
  const DisclosureRegistry = await ethers.getContractFactory("DisclosureRegistry");
  const ProofConsumer = await ethers.getContractFactory("ProofConsumer");
  const DisclosureReceiptConsumer = await ethers.getContractFactory("DisclosureReceiptConsumer");

  const complianceRegistry = await ComplianceRegistry.deploy();
  const disclosureRegistry = await DisclosureRegistry.deploy();
  const proofConsumer = await ProofConsumer.deploy(await complianceRegistry.getAddress());
  const receiptConsumer = await DisclosureReceiptConsumer.deploy(await disclosureRegistry.getAddress());
  await Promise.all([complianceRegistry.waitForDeployment(), disclosureRegistry.waitForDeployment(), proofConsumer.waitForDeployment(), receiptConsumer.waitForDeployment()]);

  const objectId = id("trade:compose:1");
  const proofId = id("proof:compose:1");
  const disclosureId = id("disclosure:compose:1");
  const receiptHash = id("receipt:compose:1");

  await (await complianceRegistry.recordProof(objectId, proofId, "groth16-dual-approval", id("assertion:1"), id("proof-hash:1"), true)).wait();
  await (await proofConsumer.acceptProof(objectId, proofId, id("proof-hash:1"))).wait();

  await (await disclosureRegistry.recordDisclosure(objectId, disclosureId, id("institution:R"), id("payload:1"), id("package:1"), id("field:1"), id("policy:1"), id("manifest:1"), id("scope:1"), "regulator.disclosure", "LB-TEST", "consumer test")).wait();
  await (await disclosureRegistry.recordReceipt(disclosureId, receiptHash, "ipfs://receipt-compose")).wait();
  await (await receiptConsumer.acknowledgeReceipt(disclosureId, receiptHash)).wait();

  console.log("Composability examples executed", {
    proofAccepted: await proofConsumer.acceptedProofs(proofId),
    receiptAcked: await receiptConsumer.acknowledgedReceipts(disclosureId)
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
