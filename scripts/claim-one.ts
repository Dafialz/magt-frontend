import { NetworkProvider } from "@ton/blueprint";
import { Address } from "@ton/core";
import { MagtClaimVault } from "../build/MagtClaimVault_MagtClaimVault.ts";

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  // Vault адреса (адмін вставить або користувач вводить вручну)
  const vaultAddr: Address = await ui.inputAddress("Vault address (EQ… of MagtClaimVault):");

  const vault = provider.open(MagtClaimVault.fromAddress(vaultAddr));

  ui.write("Sending Claim ALL… approve in your wallet");

  await vault.send(
    provider.sender(),
    { value: 50_000_000n }, // 0.05 TON на газ
    { $$type: "Claim", amount: null } // клеймити ВСЕ
  );

  ui.write("✅ Claim ALL sent");
}
