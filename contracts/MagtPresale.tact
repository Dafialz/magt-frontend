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
message WithdrawTon { to: Address; amount: Int }    // admin, amount=0 => все

// ---------------- types --------------------

struct Level {
    tokens: Int; // MAGT у raw (з десятковими)
    price: Int;  // nanoTON за 1 MAGT (за raw-одиницю)
}

// ---------------- helpers ------------------

fun tenPow(n: Int): Int {
    let r: Int = 1;
    let i: Int = 0;
    while (i < n) {
        r = r * 10;
        i = i + 1;
    }
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
        let left: Int = myBalance() - 1_000_000; // трошки пилу
        let want: Int = (msg.amount > 0) ? msg.amount : left;
        let amt: Int = iMax(0, iMin(left, want));
        if (amt > 0) {
            // stdlib-safe відправка порожнього повідомлення з TON
            send(SendParameters{
                to: self.treasury,
                value: amt,
                body: null,
                bounce: false
            });
        }
    }

    // ------------- buy ----------------------

    // покупка з реферером
    receive(msg: Buy) {
        self.processBuy(sender(), context().value, msg.ref);
    }

    // fallback: покупка без реферера (порожній body)
    receive() {
        self.processBuy(sender(), context().value, null);
    }

    // ------------- internal -----------------

    fun currentLevelIdx(sold: Int): Int {
        let acc: Int = 0;
        let i: Int = 0;
        let accVar: Int = acc;
        let iVar: Int = i;

        while (iVar < self.levelsCount) {
            let lv = self.levels.get(iVar)!!;
            let capHere: Int = accVar + lv.tokens;
            if (sold < capHere) {
                return iVar;
            }
            accVar = capHere;
            iVar = iVar + 1;
        }
        return self.levelsCount;
    }

    fun totalCap(): Int {
        let sum: Int = 0;
        let i: Int = 0;
        let sumVar: Int = sum;
        let iVar: Int = i;

        while (iVar < self.levelsCount) {
            let lv = self.levels.get(iVar)!!;
            sumVar = sumVar + lv.tokens;
            iVar = iVar + 1;
        }
        return sumVar;
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

        send(SendParameters{
            to: self.jw!!,
            value: 0,
            body: b.endCell(),
            bounce: false
        });
    }

    fun processBuy(user: Address, tonIn: Int, ref: Address?) {
        require(self.paused == false, "PAUSED");
        require(tonIn >= 10_000_000, "LOW_TON"); // ~0.01 TON
        require(self.jw != null, "NO_JW");

        let cap: Int = self.totalCap();
        require(self.sold < cap, "SOLD_OUT");

        // 1) Рахуємо, скільки MAGT купується по рівнях
        let remainTon: Int = tonIn;
        let outTokens: Int = 0;
        let soldNow: Int = self.sold;

        let remainTonVar: Int = remainTon;
        let outTokensVar: Int = outTokens;
        let soldNowVar: Int = soldNow;

        while (remainTonVar > 0) {
            let idx: Int = self.currentLevelIdx(soldNowVar);
            require(idx < self.levelsCount, "SOLD_OUT_L");
            let lv = self.levels.get(idx)!!;

            // скільки доступно в межах цього рівня
            let accBefore: Int = 0;
            let j: Int = 0;
            let accBeforeVar: Int = accBefore;
            let jVar: Int = j;

            while (jVar < idx) {
                let p = self.levels.get(jVar)!!;
                accBeforeVar = accBeforeVar + p.tokens;
                jVar = jVar + 1;
            }
            let leftHere: Int = accBeforeVar + lv.tokens - soldNowVar;

            if (leftHere <= 0) {
                // «перестрибнути» на наступний рівень без завершення циклу
                soldNowVar = accBeforeVar + lv.tokens;
                continue; // ← цей continue НЕ підтримується в Tact 1.6, тож перепишемо нижче
            }

            // (через відсутність continue в Tact 1.6 — еквівалентна розкладка)
            if (leftHere > 0) {
                let per: Int = tenPow(self.decimals);
                let canByTon: Int = (remainTonVar * per) / lv.price;
                let buyHere: Int = iMin(canByTon, leftHere);

                if (buyHere <= 0) {
                    break;
                }

                let tonSpent: Int = (buyHere * lv.price) / per;

                outTokensVar = outTokensVar + buyHere;
                soldNowVar   = soldNowVar   + buyHere;
                remainTonVar = remainTonVar - tonSpent;

                if (tonSpent == 0) { break; }
                if (soldNowVar >= cap) { break; }
            }
        }

        require(outTokensVar > 0, "ZERO_OUT");

        // 2) Реф-бонус
        let bonusVar: Int = 0;
        if (ref != null) {
            let r = ref!!;
            if ((r != user) && (r != myAddress()) && (self.refBps > 0)) {
                bonusVar = (outTokensVar * self.refBps) / 10000; // bps → %
            }
        }

        // 3) Не виходимо за кап (sold рахує покупку + бонус)
        let free: Int = cap - (self.sold + outTokensVar);
        if (free < 0) {
            // через округлення могли трохи перелізти
            outTokensVar = iMax(0, outTokensVar + free); // free від’ємний
        } else {
            if (bonusVar > free) {
                bonusVar = free;
            }
        }
        require(outTokensVar > 0, "ZERO_OUT2");

        // 4) Фіксуємо sold
        self.sold = self.sold + outTokensVar + bonusVar;

        // 5) TON → treasury (комісії платить покупець)
        send(SendParameters{
            to: self.treasury,
            value: tonIn,
            body: null,
            bounce: false
        });

        // 6) Виплата MAGT
        self.jettonTransfer(user, outTokensVar);
        if (bonusVar > 0) {
            self.jettonTransfer(ref!!, bonusVar);
        }
    }
}
