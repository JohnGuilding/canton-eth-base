pragma circom 2.0.0;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/poseidon.circom";

// Proves completionTime <= deadline without revealing completionTime.
// Public: objectId, version, deadline
// Private: completionTime
// Output: commitment = Poseidon(objectId, version, completionTime)
template DeadlineCheck(N) {
    signal input objectId;
    signal input version;
    signal input deadline;
    signal input completionTime;

    signal output commitment;

    // Decompose completionTime into N bits (proves completionTime >= 0 and < 2^N)
    component timeBits = Num2Bits(N);
    timeBits.in <== completionTime;

    // Compute diff = deadline - completionTime
    signal diff;
    diff <== deadline - completionTime;

    // Decompose diff into N bits (proves diff >= 0, i.e. deadline >= completionTime)
    component diffBits = Num2Bits(N);
    diffBits.in <== diff;

    // Compute commitment = Poseidon(objectId, version, completionTime)
    component hasher = Poseidon(3);
    hasher.inputs[0] <== objectId;
    hasher.inputs[1] <== version;
    hasher.inputs[2] <== completionTime;
    commitment <== hasher.out;
}

component main {public [objectId, version, deadline]} = DeadlineCheck(64);
