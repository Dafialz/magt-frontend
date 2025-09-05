// scripts/admin.ts
import { Address, toNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { MagtPresale } from "../build/MagtPresale_MagtPresale";

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  const presaleAddr = await ui.inputAddress("Presale address (EQ…):");
  const presale = provider.open(MagtPresale.fromAddress(presaleAddr));

  const jw = await ui.inputAddress("MAGT JettonWallet (owner=presale, master=MAGT):");
  await presale.send(
    provider.sender(),
    { value: toNano("0.05") },
    { $$type: "SetJettonWallet", addr: jw }
  );

  ui.write("✅ SetJettonWallet sent");
}
