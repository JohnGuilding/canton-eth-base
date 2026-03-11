pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

// Proves element is in a Poseidon Merkle tree with root setRoot.
// Public: objectId, version, setRoot
// Private: element, pathElements[DEPTH], pathIndices[DEPTH]
// Depth 4 supports up to 16 members.
template SetMembership(DEPTH) {
    signal input objectId;
    signal input version;
    signal input setRoot;

    signal input element;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    // Hash the leaf: Poseidon(element)
    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== element;

    // Walk the Merkle path
    component hashers[DEPTH];
    signal currentHash[DEPTH + 1];
    currentHash[0] <== leafHasher.out;

    for (var i = 0; i < DEPTH; i++) {
        // pathIndices[i] must be 0 or 1
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        hashers[i] = Poseidon(2);
        // If pathIndices[i] == 0, current is left, sibling is right
        // If pathIndices[i] == 1, sibling is left, current is right
        hashers[i].inputs[0] <== currentHash[i] + pathIndices[i] * (pathElements[i] - currentHash[i]);
        hashers[i].inputs[1] <== pathElements[i] + pathIndices[i] * (currentHash[i] - pathElements[i]);

        currentHash[i + 1] <== hashers[i].out;
    }

    // Constrain computed root == public setRoot
    currentHash[DEPTH] === setRoot;

    // Bind to objectId and version (prevent proof reuse across objects)
    // We use a dummy constraint to ensure objectId and version are part of the circuit
    signal objectVersionHash;
    component bindHasher = Poseidon(2);
    bindHasher.inputs[0] <== objectId;
    bindHasher.inputs[1] <== version;
    objectVersionHash <== bindHasher.out;
}

component main {public [objectId, version, setRoot]} = SetMembership(4);
