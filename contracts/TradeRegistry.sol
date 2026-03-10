// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract TradeRegistry is Owned {
    enum LifecycleState {
        Draft,
        Proposed,
        Matched,
        Approved,
        Settled,
        Closed,
        Cancelled
    }

    enum SettlementStatus {
        None,
        EscrowBound,
        CashPending,
        Completed,
        Failed,
        Cancelled
    }

    struct TradeHeader {
        bytes32 objectId;
        bytes32 schemaId;
        uint256 version;
        bytes32 parentVersionHash;
        LifecycleState lifecycleState;
        bytes32 stakeholderRoot;
        bytes32 policyHash;
        bytes32 fieldRoot;
        bytes32 complianceRoot;
        uint256 revocationEpoch;
        bytes32 settlementRef;
        SettlementStatus settlementStatus;
        string productType;
        string notionalBucket;
    }

    mapping(bytes32 => TradeHeader) public trades;

    event ObjectCreated(bytes32 indexed objectId, bytes32 schemaId, uint256 version, bytes32 policyHash, bytes32 fieldRoot);
    event ObjectVersioned(bytes32 indexed objectId, uint256 version, bytes32 parentVersionHash, bytes32 fieldRoot, bytes32 complianceRoot);
    event LifecycleTransitioned(bytes32 indexed objectId, LifecycleState fromState, LifecycleState toState);
    event PolicyAttached(bytes32 indexed objectId, bytes32 indexed policyHash);
    event StakeholderSetUpdated(bytes32 indexed objectId, bytes32 indexed stakeholderRoot);
    event SettlementBound(bytes32 indexed objectId, bytes32 indexed settlementRef, SettlementStatus settlementStatus);
    event SettlementCompleted(bytes32 indexed objectId, bytes32 indexed settlementRef, SettlementStatus settlementStatus);
    event RevocationEpochAdvanced(bytes32 indexed objectId, uint256 revocationEpoch);
    event ObjectCancelled(bytes32 indexed objectId, string reason);

    function createTrade(TradeHeader calldata header) external onlyOwner {
        require(header.objectId != bytes32(0), "bad objectId");
        require(header.schemaId != bytes32(0), "bad schemaId");
        require(header.version == 1, "bad version");
        require(header.stakeholderRoot != bytes32(0), "bad stakeholderRoot");
        require(header.policyHash != bytes32(0), "bad policyHash");
        require(header.fieldRoot != bytes32(0), "bad fieldRoot");
        require(trades[header.objectId].objectId == bytes32(0), "exists");
        trades[header.objectId] = header;
        emit ObjectCreated(header.objectId, header.schemaId, header.version, header.policyHash, header.fieldRoot);
        emit PolicyAttached(header.objectId, header.policyHash);
        emit StakeholderSetUpdated(header.objectId, header.stakeholderRoot);
    }

    function versionTrade(
        bytes32 objectId,
        uint256 newVersion,
        bytes32 parentVersionHash,
        bytes32 fieldRoot,
        bytes32 stakeholderRoot,
        bytes32 complianceRoot,
        string calldata productType,
        string calldata notionalBucket
    ) external onlyOwner {
        TradeHeader storage trade = trades[objectId];
        require(trade.objectId != bytes32(0), "missing");
        require(newVersion == trade.version + 1, "bad version");
        require(parentVersionHash != bytes32(0), "bad parentVersionHash");
        require(fieldRoot != bytes32(0), "bad fieldRoot");
        require(stakeholderRoot != bytes32(0), "bad stakeholderRoot");
        trade.version = newVersion;
        trade.parentVersionHash = parentVersionHash;
        trade.fieldRoot = fieldRoot;
        trade.stakeholderRoot = stakeholderRoot;
        trade.complianceRoot = complianceRoot;
        trade.productType = productType;
        trade.notionalBucket = notionalBucket;
        emit ObjectVersioned(objectId, newVersion, parentVersionHash, fieldRoot, complianceRoot);
        emit StakeholderSetUpdated(objectId, stakeholderRoot);
    }

    function transitionLifecycle(bytes32 objectId, LifecycleState newState) external onlyOwner {
        TradeHeader storage trade = trades[objectId];
        require(trade.objectId != bytes32(0), "missing");
        LifecycleState oldState = trade.lifecycleState;
        require(_isAllowedTransition(oldState, newState), "bad transition");
        trade.lifecycleState = newState;
        emit LifecycleTransitioned(objectId, oldState, newState);
    }

    function attachPolicy(bytes32 objectId, bytes32 policyHash) external onlyOwner {
        TradeHeader storage trade = trades[objectId];
        require(trade.objectId != bytes32(0), "missing");
        require(policyHash != bytes32(0), "bad policyHash");
        trade.policyHash = policyHash;
        emit PolicyAttached(objectId, policyHash);
    }

    function updateStakeholderRoot(bytes32 objectId, bytes32 stakeholderRoot) external onlyOwner {
        TradeHeader storage trade = trades[objectId];
        require(trade.objectId != bytes32(0), "missing");
        require(stakeholderRoot != bytes32(0), "bad stakeholderRoot");
        trade.stakeholderRoot = stakeholderRoot;
        emit StakeholderSetUpdated(objectId, stakeholderRoot);
    }

    function bindSettlement(bytes32 objectId, bytes32 settlementRef, SettlementStatus settlementStatus) external onlyOwner {
        TradeHeader storage trade = trades[objectId];
        require(trade.objectId != bytes32(0), "missing");
        require(settlementRef != bytes32(0), "bad settlementRef");
        require(trade.settlementRef == bytes32(0), "already bound");
        require(settlementStatus == SettlementStatus.EscrowBound || settlementStatus == SettlementStatus.CashPending, "bad status");
        trade.settlementRef = settlementRef;
        trade.settlementStatus = settlementStatus;
        emit SettlementBound(objectId, settlementRef, settlementStatus);
    }

    function completeSettlement(bytes32 objectId, SettlementStatus settlementStatus) external onlyOwner {
        TradeHeader storage trade = trades[objectId];
        require(trade.objectId != bytes32(0), "missing");
        require(trade.settlementRef != bytes32(0), "unbound");
        require(settlementStatus == SettlementStatus.Completed || settlementStatus == SettlementStatus.Failed, "bad status");
        trade.settlementStatus = settlementStatus;
        emit SettlementCompleted(objectId, trade.settlementRef, settlementStatus);
    }

    function advanceRevocationEpoch(bytes32 objectId) external onlyOwner {
        TradeHeader storage trade = trades[objectId];
        require(trade.objectId != bytes32(0), "missing");
        trade.revocationEpoch += 1;
        emit RevocationEpochAdvanced(objectId, trade.revocationEpoch);
    }

    function cancelTrade(bytes32 objectId, string calldata reason) external onlyOwner {
        TradeHeader storage trade = trades[objectId];
        require(trade.objectId != bytes32(0), "missing");
        require(trade.lifecycleState != LifecycleState.Closed, "already closed");
        trade.lifecycleState = LifecycleState.Cancelled;
        trade.settlementStatus = SettlementStatus.Cancelled;
        emit ObjectCancelled(objectId, reason);
    }

    function _isAllowedTransition(LifecycleState fromState, LifecycleState toState) internal pure returns (bool) {
        if (toState == LifecycleState.Cancelled) {
            return fromState != LifecycleState.Closed && fromState != LifecycleState.Cancelled;
        }
        if (fromState == LifecycleState.Draft) {
            return toState == LifecycleState.Proposed;
        }
        if (fromState == LifecycleState.Proposed) {
            return toState == LifecycleState.Matched;
        }
        if (fromState == LifecycleState.Matched) {
            return toState == LifecycleState.Approved;
        }
        if (fromState == LifecycleState.Approved) {
            return toState == LifecycleState.Settled;
        }
        if (fromState == LifecycleState.Settled) {
            return toState == LifecycleState.Closed;
        }
        return false;
    }
}
