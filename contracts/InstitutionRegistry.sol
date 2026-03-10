// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract InstitutionRegistry is Owned {
    enum Role {
        Unknown,
        Participant,
        Regulator
    }

    struct Institution {
        bytes32 institutionId;
        string code;
        string name;
        Role role;
        address admin;
        bool active;
        bytes32 metadataHash;
    }

    mapping(bytes32 => Institution) public institutions;

    event InstitutionRegistered(bytes32 indexed institutionId, string code, string name, Role role, address indexed admin, bytes32 metadataHash);
    event InstitutionStatusChanged(bytes32 indexed institutionId, bool active);

    function registerInstitution(
        bytes32 institutionId,
        string calldata code,
        string calldata name,
        Role role,
        address admin,
        bytes32 metadataHash
    ) external onlyOwner {
        require(institutionId != bytes32(0), "bad id");
        require(institutions[institutionId].institutionId == bytes32(0), "exists");
        institutions[institutionId] = Institution({
            institutionId: institutionId,
            code: code,
            name: name,
            role: role,
            admin: admin,
            active: true,
            metadataHash: metadataHash
        });
        emit InstitutionRegistered(institutionId, code, name, role, admin, metadataHash);
    }

    function setInstitutionActive(bytes32 institutionId, bool active) external onlyOwner {
        require(institutions[institutionId].institutionId != bytes32(0), "missing");
        institutions[institutionId].active = active;
        emit InstitutionStatusChanged(institutionId, active);
    }
}
