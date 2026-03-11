# Canton-on-Base

A prototype that rebuilds the core privacy and coordination guarantees of the [Canton Network](https://canton.network) on top of Ethereum (targeting Base). Onchain contracts handle public coordination — lifecycle, settlement, compliance records — while private trade data stays offchain, encrypted with AES-256-GCM and distributed through per-recipient key wrapping. Selective disclosure uses Merkle proofs tied to onchain commitments, and four Groth16 zero-knowledge circuits provide proof-only compliance statements (range checks, set membership, approval pre-images, deadline proofs) that are verified onchain.

## Project structure

```
contracts/               Solidity registries, settlement adapters, ZK verifiers
  verifiers/             Auto-generated Groth16 verifier contracts (4)
  ProofVerifierRouter.sol  Dispatches ZK proofs to the correct verifier
sdk/                     TypeScript helpers — crypto, bundles, Merkle, disclosure, ZK proving
scripts/                 Demo flow and circuit build pipeline
config/                  Bundle visibility policy (JSON)
zk/
  circuits/              Circom circuit sources (4)
  build/                 Compiled artifacts, zkeys, wasm (gitignored)
test/                    Hardhat tests — prototype integration + ZK e2e
docs/                    Architecture notes
```

### Setup

```bash
npm install
```

### Build circuits (requires circom 2.2.x)

```bash
npm run circuits
```

This compiles all four circom circuits, runs a powers-of-tau ceremony, generates zkeys, and exports Solidity verifier contracts into `contracts/verifiers/`.

### Build contracts

```bash
npm run build
```

### Run tests

```bash
npm test
```

11 tests: 5 prototype integration tests (bundles, disclosure, lifecycle, payloads, receipts) and 6 ZK proof tests (one per circuit type + tampered proof rejection + ProofConsumer integration).

### Demo

```bash
npm run demo
```

Deploys locally on Hardhat and runs a happy-path flow covering institution registration, trade creation, encrypted bundle distribution, compliance proofs, regulator disclosure with Merkle proofs, escrow, cash settlement, and trade closure.

## How it works

The system is split into three planes:

**Public coordination plane (onchain).** Solidity contracts store compact trade headers, lifecycle state machines, settlement status, and commitment roots. Nothing confidential is stored onchain — only hashes and Merkle roots that anchor the offchain private state.

**Private data plane (offchain).** Trade fields (pricing, counterparty metadata, risk notes, etc.) are encrypted into confidential bundles using AES-256-GCM. A fresh data encryption key (DEK) is generated per bundle, then wrapped separately for each authorized recipient using ephemeral secp256k1 ECDH key agreement + AES-256-GCM. Bundle manifests carry the encryption metadata and are anchored onchain via `PayloadRegistry`.

**Disclosure and proof plane.** Selective disclosure packages include plaintext fields plus Merkle inclusion proofs that verify against the onchain `fieldRoot` commitment. Four Groth16 ZK circuits allow parties to make compliance assertions without revealing private data:

| Circuit | Public inputs | Private inputs | Statement |
|---|---|---|---|
| `range-check` | objectId, version, limit | value | value <= limit |
| `set-membership` | objectId, version, setRoot | element, Merkle path | element is in approved set |
| `approval-exists` | objectId, version, approvalHash | approvalSecret | knowledge of approval pre-image |
| `deadline-check` | objectId, version, deadline | completionTime | completed before deadline |

Proofs are generated offchain with snarkjs, then verified onchain by auto-generated Groth16 verifier contracts. A `ProofVerifierRouter` dispatches proofs to the correct verifier and records results in `ComplianceRegistry`.

### Tech stack

- **Solidity 0.8.24** — onchain contracts (Hardhat, ethers v6)
- **circom 2.2.2 + snarkjs 0.7.x** — Groth16 circuit compilation, proving, and verifier generation
- **circomlib** — Poseidon hashing, bit decomposition
- **circomlibjs** — offchain Poseidon Merkle tree construction
- **Node.js crypto** — AES-256-GCM encryption, ECDH key agreement (secp256k1)
- **TypeScript** — SDK, tests, build tooling

## Comparison to Canton Network

Canton is a production-grade privacy-preserving protocol built on Daml smart contracts, operating across permissioned synchronization domains with a dedicated ledger API. This prototype approximates its core privacy model on a public EVM chain.

### What maps across

| Canton concept | This prototype |
|---|---|
| Transaction privacy (sub-transaction visibility) | Per-recipient encrypted bundles with field-level visibility classes |
| Commitment to private state | `fieldRoot` Merkle commitment over private fields, stored onchain |
| Selective disclosure with proof | Disclosure packages with Merkle inclusion proofs against `fieldRoot` |
| Proof-only assertions | Groth16 ZK proofs verified onchain (range, set membership, approval, deadline) |
| Participant identity + authorization | `InstitutionRegistry` with roles, `IdentityRegistry` with DID anchoring and delegate authorities |
| Lifecycle state machine | `TradeRegistry` with `Draft -> Proposed -> Matched -> Approved -> Settled -> Closed` |
| Compliance audit trail | `ComplianceRegistry` + `DisclosureRegistry` with receipt recording |
| Multi-domain settlement coordination | `EscrowAdapter` (onchain ETH) + `CashSettlementAdapter` (offchain rail reference) |

### What Canton has that this prototype does not

- **Daml smart contracts** — Canton uses Daml for contract modeling with built-in privacy semantics. This prototype uses Solidity for coordination and TypeScript for offchain logic, with no equivalent to Daml's authorization and privacy model at the language level.
- **Synchronization domains** — Canton mediates between multiple independent sync domains with guaranteed atomicity. This prototype uses a single EVM chain.
- **Mediator and sequencer nodes** — Canton has dedicated infrastructure for ordering and conflict detection. Here, the EVM provides ordering and finality.
- **Sub-transaction privacy** — Canton's privacy is granular to individual contract actions within a transaction. This prototype operates at the bundle/field level.
- **Guaranteed data minimization** — Canton structurally prevents nodes from seeing data they are not party to. Here, encrypted bundles enforce confidentiality, but distribution is application-managed.
- **Production key management** — Canton integrates with HSMs and institutional key infrastructure. This prototype generates test keys in-process.
- **Regulatory interop and domain governance** — Canton supports governance agreements and regulatory topology across domains. Not modeled here.

### What Ethereum/Base provides beyond Canton

- **Permissionless composability** — any contract can read public coordination state (lifecycle, compliance records, settlement status) without joining a permissioned domain.
- **Onchain ZK verification** — Groth16 proofs are verified by EVM contracts, creating a publicly auditable compliance record that doesn't require trust in a mediator.
- **Native settlement rails** — ETH escrow and ERC-20 settlement can be atomic with state transitions, removing the need for external settlement coordination.
- **Public event logs** — immutable, indexable event history for all coordination actions without requiring a separate audit infrastructure.
- **ProofConsumer composability** — downstream contracts can programmatically gate actions on ZK-verified compliance records (e.g., only release escrow if a range-check proof is recorded).

## Privacy model

### What is public (onchain)

All onchain data is visible to anyone reading the chain:

- Trade headers: `objectId`, `schemaId`, `version`, `lifecycleState`, `productType`, `notionalBucket`
- Commitment roots: `fieldRoot`, `stakeholderRoot`, `complianceRoot`, `policyHash`
- Settlement references and status
- Compliance proof records (proof type, assertion hash, proof hash, timestamps) — but not the private inputs
- ZK proof public signals (e.g., the limit in a range check, the Merkle root for set membership)
- Disclosure package hashes and receipt records — but not the disclosed plaintext
- Institution identities, roles, and DID anchors
- All event logs

### What is private (offchain)

- Trade field values (`x`, `y`, `z`, `pricingDetails`, `counterpartyMetadata`, `internalRiskNotes`)
- Bundle ciphertext and wrapped DEKs (distributed only to authorized recipients)
- Disclosed plaintext in disclosure packages (shared only with the disclosure recipient)
- ZK proof private inputs (the actual value in a range check, the approval secret, the completion time, the counterparty identity in set membership)
- Recipient private keys

### Privacy boundaries

Confidentiality relies on AES-256-GCM encryption and per-recipient ECDH key wrapping. A party can only decrypt a bundle if they hold the private key corresponding to a recipient wrap in the manifest. The onchain `fieldRoot` commits to the private state without revealing it, and Merkle proofs allow selective verification of individual fields.

ZK proofs allow a party to demonstrate compliance properties (value within range, counterparty in approved set, possession of approval, completion before deadline) without revealing the private inputs. The proof is verified onchain, so the compliance record is trustless.

## Known design faults

1. **No onchain enforcement of bundle distribution.** The protocol trusts the bundle creator to distribute encrypted bundles to the correct recipients. A malicious creator could withhold bundles or distribute them selectively. Canton's synchronization domains structurally prevent this.

2. **Key management is demo-grade.** Recipient keys are generated in-process with Node.js crypto. There is no key rotation, revocation checking, or HSM integration. A compromised key exposes all bundles encrypted to that recipient.

3. **Public signals leak information.** ZK proof public signals are visible onchain. For example, the `limit` in a range-check proof reveals the compliance threshold. The `setRoot` in set-membership reveals which approved set was used. Careful circuit design is needed to minimize leakage in production.

4. **No replay protection across objects for set-membership.** The set-membership circuit binds `objectId` and `version` as public inputs but uses a dummy constraint to prevent the optimizer from removing them. This works but is not as clean as incorporating them into the proof's core logic.

5. **Single-chain single-domain.** Canton's multi-domain architecture provides isolation and independent governance. This prototype puts everything on one EVM chain, meaning all coordination is globally visible (though encrypted) and subject to a single chain's liveness and governance.

6. **Verifier calldata is externally encoded.** The `ProofVerifierRouter` accepts raw calldata for the verifier `staticcall` because each verifier has a different fixed-size public signal array. The caller must correctly encode the calldata — an incorrect encoding will revert but the router cannot validate the encoding structure before the call.

7. **No data availability guarantees.** Encrypted bundles are referenced by URI in `PayloadRegistry` but the protocol does not enforce that the data is actually available at that URI. A party could anchor a payload hash and then delete the data.

8. **Poseidon hash incompatibility with keccak256.** The ZK circuits use Poseidon hashing (efficient inside SNARKs) while the Solidity contracts use keccak256. This means the onchain `fieldRoot` (keccak256-based Merkle tree) and the ZK circuit commitments (Poseidon-based) are in different hash domains. They serve complementary but disconnected purposes.

9. **Test-grade trusted setup.** The powers-of-tau ceremony and zkey contributions use deterministic entropy strings. A production deployment would require a proper multi-party ceremony with independent randomness sources.

10. **`productType` and `notionalBucket` are public.** These trade metadata fields are stored in plaintext onchain. While they don't reveal exact terms, they leak the asset class and rough size of every trade to all chain observers.
