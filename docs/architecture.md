# Prototype B Architecture

## Goal
A Base-native prototype for a Canton-like multiparty protocol with three explicit planes:

1. **Public coordination plane** — public headers, lifecycle, settlement status, stakeholder/policy commitments, disclosure receipts.
2. **Private data plane** — offchain encrypted bundle manifests for confidential payloads.
3. **Disclosure / proof plane** — regulator disclosures with lawful-basis metadata, Merkle-proof selective disclosure, and compliance assertions.

## Onchain modules
- `InstitutionRegistry.sol` — institutions A, B, C, R.
- `TradeRegistry.sol` — trade header storage, lifecycle/versioning, settlement, revocation events, stronger transition validation.
- `PayloadRegistry.sol` — payload availability metadata linked to `manifestHash`, `fieldRoot`, and `policyHash`.
- `DisclosureRegistry.sol` — disclosure package hashes, field/policy/manifest commitments, and receipt recording.
- `ComplianceRegistry.sol` — proof-only assertions and compliance commitments.
- `EscrowAdapter.sol` — native-ETH escrow for hackathon settlement coordination.
- `CashSettlementAdapter.sol` — offchain cash settlement status anchoring.

## Object commitments
### Public header fields
- `objectId`
- `schemaId`
- `version`
- `parentVersionHash`
- `lifecycleState`
- `stakeholderRoot`
- `policyHash`
- `fieldRoot`
- `complianceRoot`
- `revocationEpoch`
- `settlementRef`
- `settlementStatus`
- `productType`
- `notionalBucket`

### Private fields (offchain)
- `x`
- `y`
- `z`
- `pricingDetails`
- `counterpartyMetadata`
- `internalRiskNotes`

`fieldRoot` is now a **Merkle root over the private field map**, not just a placeholder hash. That means a disclosed plaintext field can be checked against the onchain commitment with a concrete inclusion proof.

`stakeholderRoot` and `complianceRoot` are also deterministic commitments over structured offchain data, keeping the public header compact while preserving auditability.

## Confidential bundle flow
1. Select the visible field subset for a bundle class.
2. Generate a fresh random 32-byte DEK.
3. Encrypt the cleartext bundle with **AES-256-GCM**.
4. For each authorized recipient, generate an ephemeral secp256k1 key and derive a wrap key via ECDH.
5. Wrap the DEK per recipient with **AES-256-GCM** under that derived wrap key.
6. Publish a manifest containing:
   - `payloadHash`
   - `manifestHash`
   - `fieldRoot`
   - recipient ids
   - AES-GCM envelope metadata
   - wrapped DEKs per recipient
7. Anchor payload availability onchain in `PayloadRegistry`.

This is intentionally conventional and Base-friendly: it uses Node crypto for demo/tests and keeps the public coordination surface on EVM.

## Visibility matrix
- **A / `partyA.full`**: `x,y,z,pricingDetails,counterpartyMetadata,internalRiskNotes`
- **B / `partyB.shared`**: `x,y,pricingDetails`
- **C / `partyC.min`**: `y`
- **R / `regulator.disclosure`**: `x,y`

Regulator scope is now explicitly `x,y`.

## Disclosure flow
1. Decrypt the regulator bundle using the regulator recipient key.
2. Build a disclosure package that includes:
   - disclosed plaintext fields
   - `fieldRoot`
   - `policyHash`
   - `manifestHash`
   - `payloadHash`
   - lawful-basis metadata
   - Merkle proofs for each disclosed field
3. Verify each proof offchain against the committed `fieldRoot`.
4. Record the disclosure package hash and linkage hashes onchain.
5. Record a disclosure receipt once the recipient acknowledges or archives it.

This gives a coherent audit chain:
`TradeRegistry.fieldRoot -> PayloadRegistry manifest/payload -> DisclosureRegistry package/receipt`

## Settlement flow
1. `TradeRegistry` binds `settlementRef` and escrow/cash status.
2. `EscrowAdapter` handles demo ETH escrow funding + release.
3. `CashSettlementAdapter` anchors the offchain rail reference and status.
4. `TradeRegistry` marks settlement complete and moves the lifecycle forward.

## Current limitations
These are deliberate hackathon trade-offs, not hidden gaps:
- Recipient encryption keys are test/demo artifacts rather than institution-managed production keys.
- There is no production wallet-to-encryption-key binding, revocation list, or key rotation service.
- Compliance proofs are still represented as signed/hashed artifacts rather than real ZK proof verification.
- The contracts anchor and validate commitments, but do not perform onchain cryptographic proof verification of bundle contents.
- Cash settlement and regulator receipt delivery remain mock integrations around real commitment objects.
