import { NetworkProvider } from "@ton/blueprint";
import { toNano } from "@ton/core";
import { MagtClaimVault } from "../build/MagtClaimVault_MagtClaimVault";

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  // 1) Адреса Vault (EQ…)
  const vaultAddr = await ui.inputAddress("Vault address (EQ… of MagtClaimVault):");
  const vault = provider.open(MagtClaimVault.fromAddress(vaultAddr));

  // 2) Введення кількості в RAW (з decimals)
  const amtRaw = await ui.input("Amount to claim (RAW units, e.g. 1000000000 = 1.0 MAGT if 9 decimals):");

  // Перетворення у BigInt з базовою перевіркою
  const amount = BigInt(amtRaw.trim());

  ui.write(`📤 Sending Claim for ${amount.toString()} raw MAGT… approve in wallet`);

  await vault.send(
    provider.sender(),
    { value: toNano("0.15") }, // 0.08 TON для gas
    { $$type: "Claim", amount }
  );

  ui.write("✅ Claim(amount) sent");
}
