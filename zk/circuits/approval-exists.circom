pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

// Proves knowledge of approvalSecret matching public approvalHash.
// Public: objectId, version, approvalHash
// Private: approvalSecret
// Constraint: Poseidon(objectId, version, approvalSecret) === approvalHash
template ApprovalExists() {
    signal input objectId;
    signal input version;
    signal input approvalHash;

    signal input approvalSecret;

    component hasher = Poseidon(3);
    hasher.inputs[0] <== objectId;
    hasher.inputs[1] <== version;
    hasher.inputs[2] <== approvalSecret;

    hasher.out === approvalHash;
}

component main {public [objectId, version, approvalHash]} = ApprovalExists();
