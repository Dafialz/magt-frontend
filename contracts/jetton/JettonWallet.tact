// contracts/jetton/JettonWallet.tact
// Мінімальний «скелет» гаманця під той самий компілятор

import "./stdlib/libs/msg.tact";

message InternalTransfer {
    from: Address;
    amount: Int;
}

message SetMinter {
    new_minter: Address;
}

contract JettonWallet {
    // Мінімальні поля
    owner:  Address;  // власник цього гаманця
    minter: Address;  // адреса мінтера, до якого він прив'язаний
    balance: Int;     // умовний баланс (для прикладу)

    init(owner: Address, minter: Address) {
        self.owner  = owner;
        self.minter = minter;
        self.balance = 0;
    }

    // ─── GETTERS ─────────────────────────────────────────────────────────────────
    get fun get_owner(): Address { return self.owner; }
    get fun get_minter(): Address { return self.minter; }
    get fun get_balance(): Int { return self.balance; }

    // ─── HELPERS ────────────────────────────────────────────────────────────────
    fun onlyOwner(sender: Address) {
        require(sender == self.owner, "not owner");
    }

    // ─── HANDLERS ───────────────────────────────────────────────────────────────
    receive(msg: SetMinter) {
        // даємо змінити мінтер тільки власнику
        self.onlyOwner(context().sender);
        self.minter = msg.new_minter;
    }

    receive(msg: InternalTransfer) {
        // дуже просте «зарахування», без перевірок – лише для компіляції
        self.balance = self.balance + msg.amount;
    }
}
