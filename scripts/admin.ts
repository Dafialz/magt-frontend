import { Address, toNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { MagtPresale } from "../build/MagtPresale_MagtPresale";

type Action = "SetJettonWallet" | "Pause" | "Unpause" | "Withdraw";

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  const presaleAddr = await ui.inputAddress("Presale address (EQ…):");
  const presale = provider.open(MagtPresale.fromAddress(presaleAddr));

  const action = await ui.choose<Action>("Action:", [
    "SetJettonWallet",
    "Pause",
    "Unpause",
    "Withdraw",
  ]);

  if (action === "SetJettonWallet") {
    const jw = await ui.inputAddress(
      "MAGT JettonWallet (owner=presale, master=MAGT):"
    );
    await presale.send(
      provider.sender(),
      { value: toNano("0.05") },
      { $$type: "SetJettonWallet", addr: jw }
    );
    ui.write("✅ SetJettonWallet sent");
    return;
  }

  if (action === "Pause") {
    await presale.send(
      provider.sender(),
      { value: toNano("0.05") },
      { $$type: "SetPaused", state: true }
    );
    ui.write("✅ Paused");
    return;
  }

  if (action === "Unpause") {
    await presale.send(
      provider.sender(),
      { value: toNano("0.05") },
      { $$type: "SetPaused", state: false }
    );
    ui.write("✅ Unpaused");
    return;
  }

  if (action === "Withdraw") {
    // УВАГА: у контракті WithdrawTon TON завжди йдуть у TREASURY.
    // Поле 'to' існує в повідомленні, але не використовується логікою контракту.
    const destIgnored = await ui.inputAddress(
      "Withdraw TON 'to' (ignored by contract; funds go to TREASURY):"
    );
    const amt = await ui.input("Amount in TON (0 = all available):");
    const nano = amt.trim() === "0" ? 0n : toNano(amt.trim());

    await presale.send(
      provider.sender(),
      { value: toNano("0.05") },
      { $$type: "WithdrawTon", to: destIgnored, amount: nano }
    );

    ui.write(
      "✅ Withdraw sent (note: contract sends to TREASURY regardless of 'to')."
    );
    return;
  }
}
