import { Address, toNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { MagtPresale } from "../build/MagtPresale_MagtPresale";

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  const presaleAddr = await ui.inputAddress("Presale address (EQ…):");
  const amountTonStr = (await ui.input("Amount TON to send (e.g. 0.25):")).trim();

  if (!amountTonStr) {
    ui.write("❗ Вкажи суму TON.");
    return;
  }

  // optional реферал
  const refStr = (await ui.input("Ref address (optional, press Enter to skip):")).trim();
  const ref: Address | null = refStr ? Address.parse(refStr) : null;

  const presale = provider.open(MagtPresale.fromAddress(presaleAddr));

  // Вносимо TON і тіло повідомлення Buy з optional ref
  await presale.send(
    provider.sender(),
    { value: toNano(amountTonStr) },
    { $$type: "Buy", ref }
  );

  ui.write("✅ Buy sent — підтвердь транзакцію в гаманці.");
}
