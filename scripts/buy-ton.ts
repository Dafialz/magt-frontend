import { Address, toNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { MagtPresale } from "../build/MagtPresale_MagtPresale";

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();
  const presaleAddr = await ui.inputAddress("Presale address (EQ…):");
  const amountTon = await ui.input("Amount TON to send (e.g. 0.25):");
  const presale = provider.open(MagtPresale.fromAddress(presaleAddr));

  await presale.send(provider.sender(), { value: toNano(amountTon.trim()) }, { $$type: "Buy" });
  ui.write("✅ Buy sent — approve in wallet");
}
