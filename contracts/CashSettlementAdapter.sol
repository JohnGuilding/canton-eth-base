// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract CashSettlementAdapter is Owned {
    enum CashStatus {
        None,
        Pending,
        Confirmed,
        Failed
    }

    struct CashSettlement {
        bytes32 objectId;
        bytes32 settlementRef;
        CashStatus status;
        string rail;
        bytes32 offchainReferenceHash;
        uint256 timestamp;
    }

    mapping(bytes32 => CashSettlement) public settlements;

    event CashSettlementMarked(bytes32 indexed objectId, bytes32 indexed settlementRef, CashStatus status, string rail, bytes32 offchainReferenceHash);

    function markSettlement(
        bytes32 objectId,
        bytes32 settlementRef,
        CashStatus status,
        string calldata rail,
        bytes32 offchainReferenceHash
    ) external onlyOwner {
        settlements[settlementRef] = CashSettlement({
            objectId: objectId,
            settlementRef: settlementRef,
            status: status,
            rail: rail,
            offchainReferenceHash: offchainReferenceHash,
            timestamp: block.timestamp
        });
        emit CashSettlementMarked(objectId, settlementRef, status, rail, offchainReferenceHash);
    }
}
