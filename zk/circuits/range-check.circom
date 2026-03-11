pragma circom 2.0.0;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/poseidon.circom";

// Proves value <= limit without revealing value.
// Public: objectId, version, limit
// Private: value
// Output: commitment = Poseidon(objectId, version, value)
template RangeCheck(N) {
    signal input objectId;
    signal input version;
    signal input limit;
    signal input value;

    signal output commitment;

    // Decompose value into N bits (proves value >= 0 and value < 2^N)
    component valueBits = Num2Bits(N);
    valueBits.in <== value;

    // Compute diff = limit - value
    signal diff;
    diff <== limit - value;

    // Decompose diff into N bits (proves diff >= 0, i.e. limit >= value)
    component diffBits = Num2Bits(N);
    diffBits.in <== diff;

    // Compute commitment = Poseidon(objectId, version, value)
    component hasher = Poseidon(3);
    hasher.inputs[0] <== objectId;
    hasher.inputs[1] <== version;
    hasher.inputs[2] <== value;
    commitment <== hasher.out;
}

component main {public [objectId, version, limit]} = RangeCheck(64);
