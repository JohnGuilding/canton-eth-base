// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";

contract EscrowAdapter is Owned {
    struct EscrowState {
        bytes32 objectId;
        bytes32 escrowId;
        address funder;
        uint256 amount;
        bool funded;
        bool released;
    }

    mapping(bytes32 => EscrowState) public escrows;

    event EscrowFunded(bytes32 indexed objectId, bytes32 indexed escrowId, address indexed funder, uint256 amount);
    event EscrowReleased(bytes32 indexed objectId, bytes32 indexed escrowId, address indexed recipient, uint256 amount);

    function fundEscrow(bytes32 objectId, bytes32 escrowId) external payable {
        EscrowState storage escrow = escrows[escrowId];
        require(!escrow.funded, "funded");
        escrows[escrowId] = EscrowState({
            objectId: objectId,
            escrowId: escrowId,
            funder: msg.sender,
            amount: msg.value,
            funded: true,
            released: false
        });
        emit EscrowFunded(objectId, escrowId, msg.sender, msg.value);
    }

    function releaseEscrow(bytes32 escrowId, address payable recipient) external onlyOwner {
        EscrowState storage escrow = escrows[escrowId];
        require(escrow.funded, "not funded");
        require(!escrow.released, "released");
        escrow.released = true;
        (bool ok,) = recipient.call{value: escrow.amount}("");
        require(ok, "transfer failed");
        emit EscrowReleased(escrow.objectId, escrowId, recipient, escrow.amount);
    }
}
