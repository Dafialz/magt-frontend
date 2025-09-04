// MagtPresale.tact — TON→MAGT пресейл з ціновими рівнями і реферальним бонусом
//
// Зберігає рівні {tokens, priceNanoTonPerMAGT}, приймає TON і відразу
// надсилає MAGT покупцеві з Jetton Wallet (owner=this).
// Адмін: setJettonWallet, pause/unpause, withdraw TON.
// decimals = 9 (або інший — параметр init).
//
// Реферали: повідомлення Buy містить optional ref-адресу.
// refBps (basis points) передається в init (напр. 500 = 5%).

import "@stdlib/deploy";

// ---------------- messages ----------------

message Buy { ref: Address? }                       // покупка, optional реферал
message SetJettonWallet { addr: Address }           // admin
message SetPaused { state: Bool }                   // admin
message WithdrawTon { to: Address, amount: Int }    // admin, amount=0 => все

// ---------------- types --------------------

struct Level {
    tokens: Int; // MAGT у raw (з десятковими)
    price: Int;  // nanoTON за 1 MAGT (за raw-одиницю)
}

// ---------------- helpers ------------------

fun tenPow(n: Int): Int {
    var r: Int = 1;
    var i: Int = 0;
    while (i < n) { r = r * 10; i = i + 1; }
    return r;
}

fun iMin(a: Int, b: Int): Int { return (a < b) ? a : b; }

fun iMax(a: Int, b: Int): Int { return (a > b) ? a : b; }

// ---------------- contract -----------------

contract MagtPresale with Deployable {

    owner: Address;
    treasury: Address;
    jw: Address?;            // MAGT JettonWallet (owner=this)
    decimals: Int;
    paused: Bool;
    sold: Int;               // у raw
    levels: map<Int, Level>; // 0..(n-1)
    levelsCount: Int;
    refBps: Int;             // реф. бонус у bps (10000 = 100%)

    init(
        owner: Address,
        treasury: Address,
        decimals: Int,
        levels: map<Int, Level>,
        levelsCount: Int,
        refBps: Int
    ) {
        self.owner = owner;
        self.treasury = treasury;
        self.decimals = decimals;
        self.levels = levels;
        self.levelsCount = levelsCount;
        self.paused = false;
        self.sold = 0;
        self.jw = null;
        self.refBps = refBps;
    }

    // ------------- admin --------------------

    receive(msg: SetJettonWallet) {
        require(sender() == self.owner, "NOT_ADMIN");
        self.jw = msg.addr;
    }

    receive(msg: SetPaused) {
        require(sender() == self.owner, "NOT_ADMIN");
        self.paused = msg.state;
    }

    receive(msg: WithdrawTon) {
        require(sender() == self.owner, "NOT_ADMIN");
        let left = myBalance() - 1_000_000; // трошки пилу
        let want = (msg.amount > 0) ? msg.amount : left;
        let amt = iMax(0, iMin(left, want));
        if (amt > 0) {
            // stdlib-safe відправка порожнього повідомлення з TON
            send(self.treasury, amt, null, false);
        }
    }

    // ------------- buy ----------------------

    // покупка з реферером
    receive(msg: Buy) {
        self.processBuy(sender(), value(), msg.ref);
    }

    // fallback: покупка без реферера (порожній body)
    receive() {
        self.processBuy(sender(), value(), null);
    }

    // ------------- internal -----------------

    fun currentLevelIdx(sold: Int): Int {
        var acc: Int = 0;
        var i: Int = 0;
        while (i < self.levelsCount) {
            let lv = self.levels.get(i)!!;
            let capHere = acc + lv.tokens;
            if (sold < capHere) return i;
            acc = capHere;
            i = i + 1;
        }
        return self.levelsCount;
    }

    fun totalCap(): Int {
        var sum: Int = 0;
        var i: Int = 0;
        while (i < self.levelsCount) {
            let lv = self.levels.get(i)!!;
            sum = sum + lv.tokens;
            i = i + 1;
        }
        return sum;
    }

    fun jettonTransfer(to: Address, amount: Int) {
        // стандартний wallet.transfer
        let b = beginCell();
        b.storeUint(0x0f8a7ea5, 32); // op transfer
        b.storeUint(0, 64);          // queryId
        b.storeCoins(amount);        // MAGT (raw)
        b.storeAddress(to);          // destination
        b.storeAddress(myAddress()); // response_destination
        b.storeBit(false);           // no custom_payload
        b.storeCoins(1_000_000);     // forward_ton_amount
        b.storeBit(false);           // немає forward_payload
        send(self.jw!!, 0, b.endCell(), false);
    }

    fun processBuy(user: Address, tonIn: Int, ref: Address?) {
        require(self.paused == false, "PAUSED");
        require(tonIn >= 10_000_000, "LOW_TON"); // ~0.01 TON
        require(self.jw != null, "NO_JW");

        let cap = self.totalCap();
        require(self.sold < cap, "SOLD_OUT");

        // 1) Рахуємо, скільки MAGT купується по рівнях
        var remainTon: Int = tonIn;
        var outTokens: Int = 0;
        var soldNow: Int = self.sold;

        while (remainTon > 0) {
            let idx = self.currentLevelIdx(soldNow);
            require(idx < self.levelsCount, "SOLD_OUT_L");
            let lv = self.levels.get(idx)!!;

            // скільки доступно в межах цього рівня
            var accBefore: Int = 0;
            var j: Int = 0;
            while (j < idx) {
                let p = self.levels.get(j)!!;
                accBefore = accBefore + p.tokens;
                j = j + 1;
            }
            let leftHere = accBefore + lv.tokens - soldNow;
            if (leftHere <= 0) { continue; }

            let per = tenPow(self.decimals);
            let canByTon = (remainTon * per) / lv.price;
            let buyHere = iMin(canByTon, leftHere);
            if (buyHere <= 0) { break; }

            let tonSpent = (buyHere * lv.price) / per;

            outTokens = outTokens + buyHere;
            soldNow   = soldNow   + buyHere;
            remainTon = remainTon - tonSpent;

            if (tonSpent == 0) { break; }
            if (soldNow >= cap) { break; }
        }

        require(outTokens > 0, "ZERO_OUT");

        // 2) Реф-бонус
        var bonus: Int = 0;
        if (ref != null) {
            let r = ref!!;
            if ((r != user) && (r != myAddress()) && (self.refBps > 0)) {
                bonus = (outTokens * self.refBps) / 10000; // bps → %
            }
        }

        // 3) Не виходимо за кап (sold рахує покупку + бонус)
        let free = cap - (self.sold + outTokens);
        if (free < 0) {
            // через округлення могли трохи перелізти
            outTokens = iMax(0, outTokens + free); // free від’ємний
        } else {
            if (bonus > free) bonus = free;
        }
        require(outTokens > 0, "ZERO_OUT2");

        // 4) Фіксуємо sold
        self.sold = self.sold + outTokens + bonus;

        // 5) TON → treasury (комісії платить покупець)
        send(self.treasury, tonIn, null, false);

        // 6) Виплата MAGT
        self.jettonTransfer(user, outTokens);
        if (bonus > 0) {
            self.jettonTransfer(ref!!, bonus);
        }
    }
}
