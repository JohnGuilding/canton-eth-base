import { expect } from "chai";
import { ethers } from "hardhat";
import { buildBundleManifest, decryptBundleForRecipient, recipientsFromKeyPairs, TradePrivateFields } from "../sdk/bundles";
import { buildDisclosurePackage, verifyDisclosurePackage } from "../sdk/disclosure";
import { generateRecipientKeyPair } from "../sdk/crypto";
import { buildAvailabilityMetadata } from "../sdk/payload";
import { computeComplianceRoot, computeFieldRoot, computePolicyHash, computeStakeholderRoot } from "../sdk/roots";

describe("Prototype B hardened milestone", function () {
  const privateFields: TradePrivateFields = {
    x: "x-visible-to-a-b-r",
    y: "y-visible-to-a-b-c-r",
    z: "z-visible-to-a-only",
    pricingDetails: { model: "curve-v2", rateBps: 275 },
    counterpartyMetadata: { lei: "LEI-123", domicile: "GB" },
    internalRiskNotes: "internal-only"
  };

  const objectId = ethers.id("trade:test") as `0x${string}`;
  const policyHash = computePolicyHash({ policy: "trade.v2" });

  async function deployTradeRegistry() {
    const TradeRegistry = await ethers.getContractFactory("TradeRegistry");
    const tradeRegistry = await TradeRegistry.deploy();
    await tradeRegistry.waitForDeployment();
    return tradeRegistry;
  }

  function baseTradeHeader(fieldRoot: `0x${string}`) {
    return {
      objectId,
      schemaId: ethers.id("schema:trade:v1"),
      version: 1,
      parentVersionHash: ethers.ZeroHash,
      lifecycleState: 0,
      stakeholderRoot: computeStakeholderRoot({ A: "a", B: "b", C: "c", R: "r" }),
      policyHash,
      fieldRoot,
      complianceRoot: computeComplianceRoot([]),
      revocationEpoch: 0,
      settlementRef: ethers.ZeroHash,
      settlementStatus: 0,
      productType: "IRS",
      notionalBucket: "small"
    };
  }

  it("encrypts bundles per recipient and decrypts only for the intended audience", async function () {
    const keyPairs = {
      A: { ...generateRecipientKeyPair("A"), institutionId: ethers.id("institution:A") as `0x${string}` },
      B: { ...generateRecipientKeyPair("B"), institutionId: ethers.id("institution:B") as `0x${string}` },
      R: { ...generateRecipientKeyPair("R"), institutionId: ethers.id("institution:R") as `0x${string}` },
      C: { ...generateRecipientKeyPair("C"), institutionId: ethers.id("institution:C") as `0x${string}` }
    };

    const bundle = buildBundleManifest(objectId, "partyB.shared", privateFields, recipientsFromKeyPairs([keyPairs.B]), "ipfs://bundles");
    const decrypted = decryptBundleForRecipient<Record<string, unknown>>(bundle, keyPairs.B);

    expect(decrypted).to.deep.equal({
      x: privateFields.x,
      y: privateFields.y,
      pricingDetails: privateFields.pricingDetails
    });
    expect(bundle.ciphertext).to.not.contain(privateFields.x);
    expect(bundle.manifest.fieldRoot).to.equal(computeFieldRoot(privateFields as unknown as Record<string, unknown>));

    expect(() => decryptBundleForRecipient(bundle, keyPairs.C)).to.throw("not authorized");
    expect(bundle.manifest.encryption.recipientWraps).to.have.length(1);
    expect(bundle.manifest.recipientIds).to.deep.equal(["B"]);
  });

  it("builds disclosure packages with verifiable Merkle proofs bound to the committed field root", async function () {
    const regulator = { ...generateRecipientKeyPair("R"), institutionId: ethers.id("institution:R") as `0x${string}` };
    const bundle = buildBundleManifest(objectId, "regulator.disclosure", privateFields, recipientsFromKeyPairs([regulator]), "ipfs://bundles");

    const disclosurePackage = buildDisclosurePackage({
      objectId,
      policyName: "Trade Visibility",
      policyHash,
      lawfulBasis: "request-123",
      recipientInstitutionCode: "R",
      bundle: bundle.manifest,
      privateFields,
      fieldsDisclosed: ["x", "y"],
      note: "regulator evidence"
    });

    expect(verifyDisclosurePackage(disclosurePackage)).to.equal(true);
    expect(disclosurePackage.payload.fieldRoot).to.equal(bundle.manifest.fieldRoot);
    expect(disclosurePackage.payload.proofs.map((proof) => proof.field).sort()).to.deep.equal(["x", "y"]);

    disclosurePackage.payload.disclosedFields.x = "tampered";
    expect(verifyDisclosurePackage(disclosurePackage)).to.equal(false);
  });

  it("tracks lifecycle transitions and settlement state with stronger validation", async function () {
    const tradeRegistry = await deployTradeRegistry();
    const fieldRoot = computeFieldRoot(privateFields as unknown as Record<string, unknown>);
    const settlementRef = ethers.id("settlement:test");

    await (await tradeRegistry.createTrade(baseTradeHeader(fieldRoot))).wait();

    await expect(tradeRegistry.transitionLifecycle(objectId, 2)).to.be.revertedWith("bad transition");
    await expect(tradeRegistry.versionTrade(objectId, 3, ethers.id("parent"), fieldRoot, computeStakeholderRoot({ A: 1 }), ethers.ZeroHash, "IRS", "small")).to.be.revertedWith("bad version");

    await (await tradeRegistry.transitionLifecycle(objectId, 1)).wait();
    await (await tradeRegistry.transitionLifecycle(objectId, 2)).wait();
    await (await tradeRegistry.transitionLifecycle(objectId, 3)).wait();
    await (await tradeRegistry.bindSettlement(objectId, settlementRef, 1)).wait();
    await (await tradeRegistry.completeSettlement(objectId, 3)).wait();
    await (await tradeRegistry.transitionLifecycle(objectId, 4)).wait();
    await (await tradeRegistry.transitionLifecycle(objectId, 5)).wait();

    const trade = await tradeRegistry.trades(objectId);
    expect(trade.lifecycleState).to.equal(5n);
    expect(trade.settlementRef).to.equal(settlementRef);
    expect(trade.settlementStatus).to.equal(3n);
  });

  it("records payload availability with policy and field-root linkage", async function () {
    const PayloadRegistry = await ethers.getContractFactory("PayloadRegistry");
    const payloadRegistry = await PayloadRegistry.deploy();
    await payloadRegistry.waitForDeployment();

    const keyPair = { ...generateRecipientKeyPair("A"), institutionId: ethers.id("institution:A") as `0x${string}` };
    const bundle = buildBundleManifest(objectId, "partyA.full", privateFields, recipientsFromKeyPairs([keyPair]), "ipfs://bundles");
    const availability = buildAvailabilityMetadata(bundle, policyHash);

    await expect(
      payloadRegistry.recordPayloadAvailability(
        objectId,
        bundle.manifest.payloadHash,
        bundle.manifest.manifestHash,
        bundle.manifest.fieldRoot,
        policyHash,
        availability.uri,
        availability.availabilityClass,
        availability.bundleClass
      )
    )
      .to.emit(payloadRegistry, "PayloadAvailabilityRecorded")
      .withArgs(
        objectId,
        bundle.manifest.payloadHash,
        bundle.manifest.manifestHash,
        bundle.manifest.fieldRoot,
        policyHash,
        availability.uri,
        availability.availabilityClass,
        availability.bundleClass
      );

    const stored = await payloadRegistry.payloads(bundle.manifest.payloadHash);
    expect(stored.fieldRoot).to.equal(bundle.manifest.fieldRoot);
    expect(stored.policyHash).to.equal(policyHash);
    expect(await payloadRegistry.payloadCount(objectId)).to.equal(1n);
  });

  it("records disclosure evidence and receipts with concrete linkage hashes", async function () {
    const DisclosureRegistry = await ethers.getContractFactory("DisclosureRegistry");
    const disclosureRegistry = await DisclosureRegistry.deploy();
    await disclosureRegistry.waitForDeployment();

    const regulator = { ...generateRecipientKeyPair("R"), institutionId: ethers.id("institution:R") as `0x${string}` };
    const bundle = buildBundleManifest(objectId, "regulator.disclosure", privateFields, recipientsFromKeyPairs([regulator]), "ipfs://bundles");
    const disclosurePackage = buildDisclosurePackage({
      objectId,
      policyName: "Trade Visibility",
      policyHash,
      lawfulBasis: "reg-request",
      recipientInstitutionCode: "R",
      bundle: bundle.manifest,
      privateFields,
      fieldsDisclosed: ["x", "y"],
      note: "receipt test"
    });

    await expect(
      disclosureRegistry.recordDisclosure(
        objectId,
        disclosurePackage.disclosureId,
        regulator.institutionId,
        bundle.manifest.payloadHash,
        disclosurePackage.packageHash,
        bundle.manifest.fieldRoot,
        policyHash,
        bundle.manifest.manifestHash,
        disclosurePackage.disclosedFieldsRoot,
        bundle.manifest.bundleClass,
        disclosurePackage.payload.lawfulBasis,
        disclosurePackage.payload.note
      )
    )
      .to.emit(disclosureRegistry, "DisclosureRecorded");

    const receiptHash = ethers.id("receipt:1");
    await expect(disclosureRegistry.recordReceipt(disclosurePackage.disclosureId, receiptHash, "ipfs://receipt-1"))
      .to.emit(disclosureRegistry, "DisclosureReceiptRecorded")
      .withArgs(disclosurePackage.disclosureId, receiptHash, "ipfs://receipt-1");

    const stored = await disclosureRegistry.disclosures(disclosurePackage.disclosureId);
    expect(stored.fieldRoot).to.equal(bundle.manifest.fieldRoot);
    expect(stored.policyHash).to.equal(policyHash);
    expect(stored.bundleClass).to.equal("regulator.disclosure");

    const receipt = await disclosureRegistry.receipts(disclosurePackage.disclosureId);
    expect(receipt.receiptHash).to.equal(receiptHash);
  });
});
