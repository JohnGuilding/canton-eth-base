// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract DisclosureRegistry is Owned {
    struct DisclosureRecord {
        bytes32 objectId;
        bytes32 disclosureId;
        bytes32 recipientInstitutionId;
        bytes32 payloadHash;
        bytes32 packageHash;
        bytes32 fieldRoot;
        bytes32 policyHash;
        bytes32 manifestHash;
        bytes32 disclosedFieldsRoot;
        string bundleClass;
        string lawfulBasis;
        string note;
        uint256 timestamp;
    }

    struct AdvancedDisclosurePolicy {
        string lawfulBasisCode;
        string scope;
        string retentionClass;
        uint256 expiresAt;
        bool dualControlRequired;
        bool acknowledgementRequired;
        bytes32 linkedReceiptHash;
        uint256 approvalCount;
    }

    struct DisclosureReceipt {
        bytes32 disclosureId;
        bytes32 receiptHash;
        string receiptUri;
        uint256 timestamp;
    }

    mapping(bytes32 => DisclosureRecord) public disclosures;
    mapping(bytes32 => DisclosureReceipt) public receipts;
    mapping(bytes32 => AdvancedDisclosurePolicy) public advancedPolicies;

    event DisclosureRecorded(
        bytes32 indexed objectId,
        bytes32 indexed disclosureId,
        bytes32 indexed recipientInstitutionId,
        bytes32 payloadHash,
        bytes32 packageHash,
        bytes32 fieldRoot,
        bytes32 policyHash,
        bytes32 manifestHash,
        bytes32 disclosedFieldsRoot,
        string bundleClass,
        string lawfulBasis,
        string note
    );
    event AdvancedDisclosureAnchored(bytes32 indexed disclosureId, string lawfulBasisCode, string scope, string retentionClass, uint256 expiresAt, bool dualControlRequired, bool acknowledgementRequired, bytes32 linkedReceiptHash, uint256 approvalCount);
    event DisclosureReceiptRecorded(bytes32 indexed disclosureId, bytes32 receiptHash, string receiptUri);

    function recordDisclosure(
        bytes32 objectId,
        bytes32 disclosureId,
        bytes32 recipientInstitutionId,
        bytes32 payloadHash,
        bytes32 packageHash,
        bytes32 fieldRoot,
        bytes32 policyHash,
        bytes32 manifestHash,
        bytes32 disclosedFieldsRoot,
        string calldata bundleClass,
        string calldata lawfulBasis,
        string calldata note
    ) external onlyOwner {
        require(objectId != bytes32(0), "bad objectId");
        require(disclosureId != bytes32(0), "bad disclosureId");
        require(recipientInstitutionId != bytes32(0), "bad recipient");
        require(payloadHash != bytes32(0), "bad payloadHash");
        require(packageHash != bytes32(0), "bad packageHash");
        require(fieldRoot != bytes32(0), "bad fieldRoot");
        require(policyHash != bytes32(0), "bad policyHash");
        require(manifestHash != bytes32(0), "bad manifestHash");
        require(disclosedFieldsRoot != bytes32(0), "bad disclosed root");

        DisclosureRecord storage existing = disclosures[disclosureId];
        require(existing.disclosureId == bytes32(0), "exists");

        DisclosureRecord memory record = DisclosureRecord({
            objectId: objectId,
            disclosureId: disclosureId,
            recipientInstitutionId: recipientInstitutionId,
            payloadHash: payloadHash,
            packageHash: packageHash,
            fieldRoot: fieldRoot,
            policyHash: policyHash,
            manifestHash: manifestHash,
            disclosedFieldsRoot: disclosedFieldsRoot,
            bundleClass: bundleClass,
            lawfulBasis: lawfulBasis,
            note: note,
            timestamp: block.timestamp
        });
        disclosures[disclosureId] = record;
        emit DisclosureRecorded(
            objectId,
            disclosureId,
            recipientInstitutionId,
            payloadHash,
            packageHash,
            fieldRoot,
            policyHash,
            manifestHash,
            disclosedFieldsRoot,
            bundleClass,
            lawfulBasis,
            note
        );
    }

    function anchorAdvancedPolicy(
        bytes32 disclosureId,
        string calldata lawfulBasisCode,
        string calldata scope,
        string calldata retentionClass,
        uint256 expiresAt,
        bool dualControlRequired,
        bool acknowledgementRequired,
        bytes32 linkedReceiptHash,
        uint256 approvalCount
    ) external onlyOwner {
        require(disclosures[disclosureId].disclosureId != bytes32(0), "missing disclosure");
        advancedPolicies[disclosureId] = AdvancedDisclosurePolicy({
            lawfulBasisCode: lawfulBasisCode,
            scope: scope,
            retentionClass: retentionClass,
            expiresAt: expiresAt,
            dualControlRequired: dualControlRequired,
            acknowledgementRequired: acknowledgementRequired,
            linkedReceiptHash: linkedReceiptHash,
            approvalCount: approvalCount
        });
        emit AdvancedDisclosureAnchored(disclosureId, lawfulBasisCode, scope, retentionClass, expiresAt, dualControlRequired, acknowledgementRequired, linkedReceiptHash, approvalCount);
    }

    function recordReceipt(bytes32 disclosureId, bytes32 receiptHash, string calldata receiptUri) external onlyOwner {
        require(disclosures[disclosureId].disclosureId != bytes32(0), "missing disclosure");
        require(receiptHash != bytes32(0), "bad receiptHash");
        receipts[disclosureId] = DisclosureReceipt({
            disclosureId: disclosureId,
            receiptHash: receiptHash,
            receiptUri: receiptUri,
            timestamp: block.timestamp
        });
        emit DisclosureReceiptRecorded(disclosureId, receiptHash, receiptUri);
    }
}
