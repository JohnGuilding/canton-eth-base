// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";
import "./ComplianceRegistry.sol";

contract ProofVerifierRouter is Owned {
    ComplianceRegistry public complianceRegistry;

    // proofType => verifier contract address
    mapping(string => address) public verifiers;

    event VerifierRegistered(string proofType, address verifier);
    event ProofVerifiedAndRecorded(bytes32 indexed objectId, bytes32 indexed proofId, string proofType);

    constructor(address complianceRegistry_) {
        complianceRegistry = ComplianceRegistry(complianceRegistry_);
    }

    function registerVerifier(string calldata proofType, address verifier) external onlyOwner {
        require(verifier != address(0), "zero verifier");
        verifiers[proofType] = verifier;
        emit VerifierRegistered(proofType, verifier);
    }

    /**
     * @notice Verifies a Groth16 proof onchain and records it in ComplianceRegistry.
     * @dev Uses raw calldata (staticcall) since verifiers have different public signal array sizes.
     *      Caller must ABI-encode the full verifyProof(...) calldata externally.
     * @param objectId The object this proof is bound to.
     * @param proofId Unique proof identifier.
     * @param proofType Key to look up the verifier (e.g. "range-check").
     * @param verifierCalldata ABI-encoded verifyProof call with pA, pB, pC, pubSignals.
     * @param proofHash Hash of the proof data for recording.
     */
    function verifyAndRecord(
        bytes32 objectId,
        bytes32 proofId,
        string calldata proofType,
        bytes calldata verifierCalldata,
        bytes32 proofHash
    ) external returns (bytes32) {
        address verifier = verifiers[proofType];
        require(verifier != address(0), "no verifier");

        (bool success, bytes memory result) = verifier.staticcall(verifierCalldata);
        require(success && result.length >= 32, "verification call failed");

        bool verified = abi.decode(result, (bool));
        require(verified, "proof invalid");

        bytes32 assertionHash = keccak256(abi.encodePacked(proofType, objectId));

        bytes32 recordedId = complianceRegistry.recordProof(
            objectId,
            proofId,
            proofType,
            assertionHash,
            proofHash,
            true // proofOnly = true for ZK proofs
        );

        emit ProofVerifiedAndRecorded(objectId, proofId, proofType);
        return recordedId;
    }
}
