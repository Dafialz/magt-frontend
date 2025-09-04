// contracts/MagtClaimVault.tact
// MAGT Claim Vault (allowance-based, Tact 1.6.x compatible)

import "@stdlib/deploy";
import "@stdlib/ownable";

// ---- Jetton/TIP-3 ----
const JETTON_TRANSFER: Int = 0x0f8a7ea5;

// ---- Messages ----
message Claim { amount: Int? }                        // user: optional amount (if none → claim all)
message SetJettonWallet { addr: Address }             // admin: set MAGT JettonWallet (owner=this contract)
message SetAllowance { addr: Address; amount: Int }   // admin: set allowance for addr (<=0 deletes)

// ---- Contract ----
contract MagtClaimVault with Deployable, Ownable {

  // required by Ownable
  owner: Address;

  // storage
  feeTon: Int;                    // min TON in incoming Claim (nanotons)
  jettonWallet: Address?;         // MAGT JettonWallet of this contract
  allowances: map<Address, Int>;  // addr → amount (jetton units)

  // init
  init(owner: Address, feeTon: Int) {
    self.owner = owner;
    self.feeTon = feeTon;         // e.g. 50_000_000 (0.05 TON)
    self.jettonWallet = null;     // literal null in 1.6.x
    self.allowances = emptyMap(); // type inferred
  }

  // getters
  get fun get_admin(): Address { return self.owner; }
  get fun get_fee_ton(): Int { return self.feeTon; }
  get fun get_jetton_wallet(): Address? { return self.jettonWallet; }
  get fun get_allowance(addr: Address): Int {
    let vOpt = self.allowances.get(addr);   // Int?
    return (vOpt != null) ? vOpt!! : 0;
  }

  // --- admin
  receive(msg: SetJettonWallet) {
    require(sender() == self.owner, "NOT_ADMIN");
    self.jettonWallet = msg.addr;
  }

  receive(msg: SetAllowance) {
    require(sender() == self.owner, "NOT_ADMIN");
    if (msg.amount <= 0) {
      self.allowances.del(msg.addr);
    } else {
      self.allowances.set(msg.addr, msg.amount);
    }
  }

  // --- user claim
  receive(msg: Claim) {
    // checks
    require(self.jettonWallet != null, "NO_JW");
    require(context().value >= self.feeTon, "LOW_FEE");

    let user = sender();

    // unwrap allowance Int? → Int
    let curOpt = self.allowances.get(user);          // Int?
    require(curOpt != null, "NO_ALLOWANCE");
    let current = curOpt!!;                          // Int
    require(current > 0, "NO_ALLOWANCE");

    // amount to send (unwrap msg.amount if provided)
    let amount = (msg.amount != null) ? msg.amount!! : current;
    require(amount > 0, "ZERO_AMOUNT");
    require(current >= amount, "LOW_ALLOWANCE");

    // update allowance
    let remain = current - amount;
    if (remain > 0) {
      self.allowances.set(user, remain);
    } else {
      self.allowances.del(user);
    }

    // build JettonWallet.transfer body
    let fwdTon: Int = 50_000_000; // 0.05 TON
    let b = beginCell();
    b.storeUint(JETTON_TRANSFER, 32);
    b.storeUint(now(), 64);
    b.storeUint(amount, 128);
    b.storeAddress(user);             // destination
    b.storeAddress(myAddress());     // response_destination
    b.storeMaybeRef(null);            // custom_payload = null
    b.storeCoins(fwdTon);             // forward_ton_amount

    b.storeMaybeRef(null);            // no forward_payload

    // send to our JW (use incoming value for gas)
    send(SendParameters{
      to: self.jettonWallet!!,
      value: context().value,
      bounce: true,
      body: b.endCell()
    });
  }
}
