// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract PayloadRegistry is Owned {
    struct PayloadRecord {
        bytes32 objectId;
        bytes32 payloadHash;
        bytes32 manifestHash;
        bytes32 fieldRoot;
        bytes32 policyHash;
        string uri;
        string availabilityClass;
        string bundleClass;
        uint256 timestamp;
    }

    struct PayloadReplica {
        bytes32 payloadHash;
        string mirrorUri;
        string availabilityState;
        string trustBoundary;
        bytes32 metadataHash;
        uint256 timestamp;
    }

    mapping(bytes32 => PayloadRecord) public payloads;
    mapping(bytes32 => bytes32[]) public payloadsByObject;
    mapping(bytes32 => PayloadReplica[]) internal replicasByPayload;

    event PayloadAvailabilityRecorded(
        bytes32 indexed objectId,
        bytes32 indexed payloadHash,
        bytes32 indexed manifestHash,
        bytes32 fieldRoot,
        bytes32 policyHash,
        string uri,
        string availabilityClass,
        string bundleClass
    );
    event PayloadReplicaRecorded(bytes32 indexed payloadHash, string mirrorUri, string availabilityState, string trustBoundary, bytes32 metadataHash);

    function recordPayloadAvailability(
        bytes32 objectId,
        bytes32 payloadHash,
        bytes32 manifestHash,
        bytes32 fieldRoot,
        bytes32 policyHash,
        string calldata uri,
        string calldata availabilityClass,
        string calldata bundleClass
    ) external onlyOwner {
        require(objectId != bytes32(0), "bad objectId");
        require(payloadHash != bytes32(0), "bad payloadHash");
        require(manifestHash != bytes32(0), "bad manifestHash");
        require(fieldRoot != bytes32(0), "bad fieldRoot");
        require(policyHash != bytes32(0), "bad policyHash");
        require(payloads[payloadHash].payloadHash == bytes32(0), "exists");

        payloads[payloadHash] = PayloadRecord({
            objectId: objectId,
            payloadHash: payloadHash,
            manifestHash: manifestHash,
            fieldRoot: fieldRoot,
            policyHash: policyHash,
            uri: uri,
            availabilityClass: availabilityClass,
            bundleClass: bundleClass,
            timestamp: block.timestamp
        });
        payloadsByObject[objectId].push(payloadHash);

        emit PayloadAvailabilityRecorded(objectId, payloadHash, manifestHash, fieldRoot, policyHash, uri, availabilityClass, bundleClass);
    }

    function recordReplica(
        bytes32 payloadHash,
        string calldata mirrorUri,
        string calldata availabilityState,
        string calldata trustBoundary,
        bytes32 metadataHash
    ) external onlyOwner {
        require(payloads[payloadHash].payloadHash != bytes32(0), "missing payload");
        require(metadataHash != bytes32(0), "bad metadataHash");
        replicasByPayload[payloadHash].push(PayloadReplica({
            payloadHash: payloadHash,
            mirrorUri: mirrorUri,
            availabilityState: availabilityState,
            trustBoundary: trustBoundary,
            metadataHash: metadataHash,
            timestamp: block.timestamp
        }));
        emit PayloadReplicaRecorded(payloadHash, mirrorUri, availabilityState, trustBoundary, metadataHash);
    }

    function payloadCount(bytes32 objectId) external view returns (uint256) {
        return payloadsByObject[objectId].length;
    }

    function replicaCount(bytes32 payloadHash) external view returns (uint256) {
        return replicasByPayload[payloadHash].length;
    }

    function replicaAt(bytes32 payloadHash, uint256 index) external view returns (PayloadReplica memory) {
        return replicasByPayload[payloadHash][index];
    }
}
