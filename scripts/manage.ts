import { NetworkProvider } from "@ton/blueprint";
import { Address } from "@ton/core";
import { MagtClaimVault } from "../build/MagtClaimVault_MagtClaimVault";

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  const vaultAddr = await ui.inputAddress("Vault address (EQ… of MagtClaimVault):");

  const action = await ui.choose(
    "Action:",
    ["SetJettonWallet", "SetAllowance"],
    (v) => v
  );

  const vault = provider.open(MagtClaimVault.fromAddress(vaultAddr));

  if (action === "SetJettonWallet") {
    const jw = await ui.inputAddress("MAGT JettonWallet address (owner=vault, master=MAGT):");
    await vault.send(
      provider.sender(),
      { value: 50_000_000n }, // 0.05 TON у нанотонах
      { $$type: "SetJettonWallet", addr: jw }
    );
    ui.write("✅ SetJettonWallet sent");
    return;
  }

  if (action === "SetAllowance") {
    const user = await ui.inputAddress("User address (EQ…):");
    const amtStr = await ui.input(
      "Amount in MAGT units (raw, with decimals) e.g. 1000000000 for 1.0 if 9 decimals:"
    );
    const amt = BigInt(amtStr.trim());
    await vault.send(
      provider.sender(),
      { value: 50_000_000n }, // 0.05 TON у нанотонах
      { $$type: "SetAllowance", addr: user, amount: amt }
    );
    ui.write("✅ SetAllowance sent");
    return;
  }
}
