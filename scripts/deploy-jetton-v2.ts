// scripts/deploy-jetton-v2.ts
import { toNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { JettonMinter } from "../build/JettonMinter_JettonMinter";

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();
  const sender = provider.sender(); // твій cold UQ...

  ui.write("🚀 Deploy Jetton Minter (owner = твій cold wallet)");

  const opened = provider.open(
    await JettonMinter.fromInit(sender.address!)
  );

  await sender.send({
    to: opened.address,
    value: toNano("0.2"),
    init: opened.init,
  });

  ui.write(`✅ Deployed. Address: ${opened.address.toString()}`);
}
