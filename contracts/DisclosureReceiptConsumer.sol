// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDisclosureRegistryReceipts {
    function receipts(bytes32 disclosureId) external view returns (bytes32, bytes32 receiptHash, string memory, uint256);
}

contract DisclosureReceiptConsumer {
    IDisclosureRegistryReceipts public immutable disclosureRegistry;
    mapping(bytes32 => bytes32) public acknowledgedReceipts;

    event ReceiptAcknowledged(bytes32 indexed disclosureId, bytes32 indexed receiptHash);

    constructor(address disclosureRegistry_) {
        disclosureRegistry = IDisclosureRegistryReceipts(disclosureRegistry_);
    }

    function acknowledgeReceipt(bytes32 disclosureId, bytes32 expectedReceiptHash) external {
        (, bytes32 receiptHash,,) = disclosureRegistry.receipts(disclosureId);
        require(receiptHash == expectedReceiptHash, "receipt mismatch");
        acknowledgedReceipts[disclosureId] = receiptHash;
        emit ReceiptAcknowledged(disclosureId, receiptHash);
    }
}
