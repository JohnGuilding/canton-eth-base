# Canton-on-Base Prototype B

A hackathon-realistic MVP for a **Base-native, Canton-like multiparty protocol** with:
- a **public coordination plane** onchain,
- a **private data plane** using real encrypted confidential bundles,
- a **disclosure / proof plane** with concrete selective-disclosure packages, Merkle proofs, and receipt recording.

## What this now implements
### Onchain contracts
- `InstitutionRegistry.sol`
- `TradeRegistry.sol`
- `DisclosureRegistry.sol`
- `ComplianceRegistry.sol`
- `PayloadRegistry.sol`
- `EscrowAdapter.sol`
- `CashSettlementAdapter.sol`

### Offchain tooling
- Deterministic canonicalization + hashing helpers
- Merkle commitments for field / stakeholder / compliance roots
- Real confidential bundles using **AES-256-GCM** payload encryption
- Real per-recipient DEK wrapping using **ephemeral-static secp256k1 ECDH + AES-256-GCM**
- Verifiable payload manifests bound to `fieldRoot` / `policyHash`
- Verifiable disclosure packages with disclosed plaintext + Merkle proofs
- Payload availability metadata generation for bundle-first distribution

## Trade model
Public header fields:
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

Private fields modeled offchain:
- `x`
- `y`
- `z`
- `pricingDetails`
- `counterpartyMetadata`
- `internalRiskNotes`

Visibility matrix:
- **A** sees `x,y,z,pricingDetails,counterpartyMetadata,internalRiskNotes`
- **B** sees `x,y,pricingDetails`
- **C** sees `y`
- **R** sees `x,y` under policy `P`

The bundle config lives in `config/policy.trade.json` and keeps **bundle-first visibility classes**.

## Lifecycle
`Draft -> Proposed -> Matched -> Approved -> Settled -> Closed`

`Cancelled` is also supported onchain.

## What is real vs simplified
### Real in this milestone
- Confidential bundles are actually encrypted.
- A fresh DEK is generated per bundle.
- The DEK is wrapped separately for each authorized recipient.
- Bundle manifests carry concrete encryption metadata and recipient wraps.
- `fieldRoot` is a Merkle commitment over the private object fields.
- Disclosure packages include plaintext disclosures plus Merkle proofs that verify against `fieldRoot`.
- Payload availability records and disclosure records are linked onchain to `fieldRoot`, `policyHash`, `manifestHash`, and evidence hashes.
- Trade lifecycle / settlement / disclosure receipt flows are runnable and tested.

### Still intentionally simplified
- Recipient encryption keys are generated inside the demo/tests; there is no production KMS/HSM or wallet-based key agreement layer.
- Compliance proofs are still hash-based attestations / proof artifacts rather than a real ZK circuit integration.
- Cash settlement remains a public coordination adapter around an offchain rail reference, not a bank API integration.
- Escrow is a minimal native-ETH adapter for demo purposes.
- Policy enforcement is represented by deterministic commitments and registry checks, not a full programmable legal / entitlement engine.

## Quick start
```bash
npm install
npm run build
npm run test
npm run demo
```

The demo deploys locally on Hardhat and runs a happy-path flow:
1. Register institutions `A`, `B`, `C`, `R`
2. Create a trade object whose onchain `fieldRoot` commits to the private state
3. Build encrypted payload manifests for all visibility bundles
4. Record payload availability with `fieldRoot` / `policyHash` linkage
5. Record a proof-only compliance assertion and version the trade
6. Execute regulator disclosure + receipt flow for regulator scope `x,y`
7. Verify disclosure proofs against the committed field root
8. Bind and release escrow
9. Mark cash settlement complete
10. Close the trade and advance revocation epoch

## Repository layout
```text
contracts/   Solidity registries and settlement adapters
scripts/     end-to-end demo flow
sdk/         crypto, Merkle, disclosure, hashing, and bundle helpers
config/      policy DSL / JSON config
docs/        architecture notes
test/        contract + offchain crypto/disclosure tests
STATUS.md    milestone log required by the spec
```

## Base-native design notes
- Uses straightforward EVM patterns that can deploy on Base.
- Public coordination lives onchain through compact headers, lifecycle state, settlement state, and immutable event logs.
- Confidential payloads stay offchain but are now bound to public commitments with real encryption and verifiable manifests.
- Settlement is split into an escrow adapter and a cash settlement adapter to mirror hybrid onchain/offchain flows.

## Key files to inspect
- `contracts/TradeRegistry.sol`
- `contracts/DisclosureRegistry.sol`
- `contracts/PayloadRegistry.sol`
- `sdk/bundles.ts`
- `sdk/disclosure.ts`
- `sdk/merkle.ts`
- `scripts/demo.ts`
- `docs/architecture.md`
