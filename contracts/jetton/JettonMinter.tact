// contracts/jetton/JettonMinter.tact
// Мінімальний «скелет» мінтера, придатний для компіляції Tact 1.6.x
// Без залежностей на @stdlib/msg та @stdlib/jetton

import "./stdlib/libs/msg.tact";                // локальний заглушковий msg
// import "@stdlib/libs/ownable.tact";          // можна підключити пізніше, якщо треба

message Mint {
    to: Address;
    amount: Int;
}

message SetOwner {
    new_owner: Address;
}

contract JettonMinter {
    // Власник (адмін) мінтера
    owner: Address;

    init(owner: Address) {
        self.owner = owner;
    }

    // ─── GETTERS ─────────────────────────────────────────────────────────────────
    get fun get_owner(): Address {
        return self.owner;
    }

    // ─── HELPERS ────────────────────────────────────────────────────────────────
    fun onlyOwner(sender: Address) {
        // дуже проста перевірка «адміністратор»
        require(sender == self.owner, "not owner");
    }

    // ─── HANDLERS ───────────────────────────────────────────────────────────────
    receive(msg: SetOwner) {
        // очікуємо, що відправник – поточний owner
        self.onlyOwner(context().sender);
        self.owner = msg.new_owner;
    }

    receive(_: Mint) {
        // Це просто мінімальна заглушка, щоб контракт компілювався.
        // Логіку карбування/відправки токенів додамо пізніше.
        // Наразі – нічого не робимо.
    }
}
