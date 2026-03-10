// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract ApprovalRegistry is Owned {
    struct ApprovalArtifact {
        bytes32 approvalId;
        bytes32 objectId;
        bytes32 approverInstitutionId;
        bytes32 approverRoleAttestationHash;
        bytes32 artifactHash;
        bytes32 linkedDisclosureId;
        bytes32 linkedReceiptHash;
        string approvalKind;
        uint256 timestamp;
    }

    mapping(bytes32 => ApprovalArtifact) public approvals;
    mapping(bytes32 => bytes32[]) public approvalsByObject;

    event ApprovalRecorded(
        bytes32 indexed approvalId,
        bytes32 indexed objectId,
        bytes32 indexed approverInstitutionId,
        bytes32 approverRoleAttestationHash,
        bytes32 artifactHash,
        bytes32 linkedDisclosureId,
        bytes32 linkedReceiptHash,
        string approvalKind
    );

    function recordApproval(
        bytes32 approvalId,
        bytes32 objectId,
        bytes32 approverInstitutionId,
        bytes32 approverRoleAttestationHash,
        bytes32 artifactHash,
        bytes32 linkedDisclosureId,
        bytes32 linkedReceiptHash,
        string calldata approvalKind
    ) external onlyOwner {
        require(approvalId != bytes32(0), "bad approvalId");
        require(objectId != bytes32(0), "bad objectId");
        require(approverInstitutionId != bytes32(0), "bad institution");
        require(artifactHash != bytes32(0), "bad artifact");
        require(approvals[approvalId].approvalId == bytes32(0), "exists");

        approvals[approvalId] = ApprovalArtifact({
            approvalId: approvalId,
            objectId: objectId,
            approverInstitutionId: approverInstitutionId,
            approverRoleAttestationHash: approverRoleAttestationHash,
            artifactHash: artifactHash,
            linkedDisclosureId: linkedDisclosureId,
            linkedReceiptHash: linkedReceiptHash,
            approvalKind: approvalKind,
            timestamp: block.timestamp
        });
        approvalsByObject[objectId].push(approvalId);
        emit ApprovalRecorded(approvalId, objectId, approverInstitutionId, approverRoleAttestationHash, artifactHash, linkedDisclosureId, linkedReceiptHash, approvalKind);
    }

    function approvalCount(bytes32 objectId) external view returns (uint256) {
        return approvalsByObject[objectId].length;
    }
}
