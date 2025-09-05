// contracts/jetton/stdlib/jetton/jetton.tact
// Minimal local Jetton "spec" to unblock build.
// Defines common OP codes and message structs used by Jetton minter/wallet.
// This is NOT a full TIP-3 implementation, just types + constants.

import "@stdlib/std/stdlib.tact";

const OP_JETTON_TRANSFER          = 0x0f8a7ea5; // external transfer request
const OP_JETTON_INTERNAL_TRANSFER = 0x178d4519; // internal hop
const OP_JETTON_TRANSFER_NOTIFICATION = 0x7362d09c;
const OP_JETTON_BURN              = 0x595f07bc;
const OP_JETTON_BURN_NOTIFICATION = 0x7bdd97de;

// External message: user asks wallet to transfer jettons
struct JettonTransfer {
    query_id: Int;
    amount: Int;
    destination: Address;
    response_destination: Address; // may be 0
    custom_payload: Cell;          // optional, can be empty
    forward_ton_amount: Int;       // how much TON to forward with notification
    forward_payload: Cell;         // payload for notification
}

// Internal hop between wallets (wallet -> wallet)
struct JettonInternalTransfer {
    query_id: Int;
    amount: Int;
    from: Address;
    response_destination: Address; // may be 0
    custom_payload: Cell;          // optional
    forward_ton_amount: Int;
    forward_payload: Cell;
}

// Notification to receiver (wallet -> receiver)
struct JettonTransferNotification {
    query_id: Int;
    amount: Int;
    sender: Address;
    forward_payload: Cell;
}

// Burn request from wallet to minter
struct JettonBurn {
    query_id: Int;
    amount: Int;
    response_destination: Address; // where to send confirmation
    custom_payload: Cell;
}

// Burn confirmation from minter to wallet
struct JettonBurnNotification {
    query_id: Int;
    amount: Int;
    sender: Address;
    custom_payload: Cell;
}

// Helper: empty cell constant
fun emptyCell(): Cell {
    return beginCell().endCell();
}
