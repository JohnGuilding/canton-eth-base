// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract IdentityRegistry is Owned {
    enum AuthorityClass {
        Execution,
        Viewing,
        Recovery,
        Approval
    }

    struct IdentityRecord {
        bytes32 institutionId;
        string did;
        string didDocumentUri;
        bytes32 didDocumentHash;
        bytes32 roleAttestationRoot;
        uint256 keyEpoch;
        bool active;
    }

    struct DelegateRecord {
        bytes32 institutionId;
        address delegate;
        AuthorityClass authority;
        bytes32 scopeHash;
        uint256 notBefore;
        uint256 notAfter;
        bytes32 roleAttestationHash;
        bool active;
    }

    mapping(bytes32 => IdentityRecord) public identities;
    mapping(bytes32 => mapping(address => DelegateRecord)) public delegates;

    event IdentityAnchored(bytes32 indexed institutionId, string did, string didDocumentUri, bytes32 didDocumentHash);
    event DelegateConfigured(bytes32 indexed institutionId, address indexed delegate, AuthorityClass authority, bytes32 scopeHash, uint256 notBefore, uint256 notAfter, bytes32 roleAttestationHash, bool active);
    event RoleAttestationRootUpdated(bytes32 indexed institutionId, bytes32 roleAttestationRoot);
    event KeyEpochBumped(bytes32 indexed institutionId, uint256 keyEpoch);

    function anchorIdentity(
        bytes32 institutionId,
        string calldata did,
        string calldata didDocumentUri,
        bytes32 didDocumentHash,
        bytes32 roleAttestationRoot
    ) external onlyOwner {
        require(institutionId != bytes32(0), "bad id");
        require(bytes(did).length > 0, "bad did");
        require(didDocumentHash != bytes32(0), "bad doc hash");

        IdentityRecord storage record = identities[institutionId];
        if (record.institutionId == bytes32(0)) {
            record.institutionId = institutionId;
            record.keyEpoch = 1;
            record.active = true;
        }
        record.did = did;
        record.didDocumentUri = didDocumentUri;
        record.didDocumentHash = didDocumentHash;
        record.roleAttestationRoot = roleAttestationRoot;

        emit IdentityAnchored(institutionId, did, didDocumentUri, didDocumentHash);
        emit RoleAttestationRootUpdated(institutionId, roleAttestationRoot);
    }

    function configureDelegate(
        bytes32 institutionId,
        address delegate,
        AuthorityClass authority,
        bytes32 scopeHash,
        uint256 notBefore,
        uint256 notAfter,
        bytes32 roleAttestationHash,
        bool active
    ) external onlyOwner {
        require(identities[institutionId].institutionId != bytes32(0), "missing identity");
        require(delegate != address(0), "bad delegate");
        require(notAfter == 0 || notAfter >= notBefore, "bad window");
        delegates[institutionId][delegate] = DelegateRecord({
            institutionId: institutionId,
            delegate: delegate,
            authority: authority,
            scopeHash: scopeHash,
            notBefore: notBefore,
            notAfter: notAfter,
            roleAttestationHash: roleAttestationHash,
            active: active
        });
        emit DelegateConfigured(institutionId, delegate, authority, scopeHash, notBefore, notAfter, roleAttestationHash, active);
    }

    function bumpKeyEpoch(bytes32 institutionId) external onlyOwner {
        require(identities[institutionId].institutionId != bytes32(0), "missing identity");
        identities[institutionId].keyEpoch += 1;
        emit KeyEpochBumped(institutionId, identities[institutionId].keyEpoch);
    }

    function hasAuthority(bytes32 institutionId, address delegate, AuthorityClass authority) external view returns (bool) {
        DelegateRecord storage record = delegates[institutionId][delegate];
        if (!record.active || record.authority != authority) {
            return false;
        }
        if (block.timestamp < record.notBefore) {
            return false;
        }
        if (record.notAfter != 0 && block.timestamp > record.notAfter) {
            return false;
        }
        return true;
    }
}
