// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IComplianceRegistry {
    function proofs(bytes32 proofId) external view returns (bytes32 objectId, bytes32, string memory, bytes32, bytes32 proofHash, bool proofOnly, uint256);
}

contract ProofConsumer {
    IComplianceRegistry public immutable complianceRegistry;
    mapping(bytes32 => bool) public acceptedProofs;

    event ProofAccepted(bytes32 indexed objectId, bytes32 indexed proofId, bytes32 proofHash);

    constructor(address complianceRegistry_) {
        complianceRegistry = IComplianceRegistry(complianceRegistry_);
    }

    function acceptProof(bytes32 objectId, bytes32 proofId, bytes32 expectedProofHash) external {
        (bytes32 storedObjectId,, , , bytes32 proofHash, bool proofOnly,) = complianceRegistry.proofs(proofId);
        require(storedObjectId == objectId, "wrong object");
        require(proofOnly, "not proof-only");
        require(proofHash == expectedProofHash, "hash mismatch");
        acceptedProofs[proofId] = true;
        emit ProofAccepted(objectId, proofId, proofHash);
    }
}
