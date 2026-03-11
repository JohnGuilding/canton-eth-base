// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract ComplianceRegistry is Owned {
    struct ComplianceProof {
        bytes32 objectId;
        bytes32 proofId;
        string proofType;
        bytes32 assertionHash;
        bytes32 proofHash;
        bool proofOnly;
        uint256 timestamp;
    }

    mapping(bytes32 => ComplianceProof) public proofs;
    mapping(bytes32 => bytes32[]) public proofsByObject;
    mapping(address => bool) public authorized;

    event ComplianceProofRecorded(
        bytes32 indexed objectId,
        bytes32 indexed proofId,
        string proofType,
        bytes32 assertionHash,
        bytes32 proofHash,
        bool proofOnly
    );

    event Authorized(address indexed caller, bool status);

    function authorize(address caller) external onlyOwner {
        authorized[caller] = true;
        emit Authorized(caller, true);
    }

    function deauthorize(address caller) external onlyOwner {
        authorized[caller] = false;
        emit Authorized(caller, false);
    }

    function recordProof(
        bytes32 objectId,
        bytes32 proofId,
        string calldata proofType,
        bytes32 assertionHash,
        bytes32 proofHash,
        bool proofOnly
    ) external returns (bytes32) {
        require(msg.sender == owner || authorized[msg.sender], "not authorized");
        proofs[proofId] = ComplianceProof({
            objectId: objectId,
            proofId: proofId,
            proofType: proofType,
            assertionHash: assertionHash,
            proofHash: proofHash,
            proofOnly: proofOnly,
            timestamp: block.timestamp
        });
        proofsByObject[objectId].push(proofId);
        emit ComplianceProofRecorded(objectId, proofId, proofType, assertionHash, proofHash, proofOnly);
        return proofId;
    }

    function latestObjectProof(bytes32 objectId) external view returns (bytes32) {
        uint256 count = proofsByObject[objectId].length;
        require(count > 0, "none");
        return proofsByObject[objectId][count - 1];
    }
}
