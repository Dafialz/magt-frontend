import { NetworkProvider } from "@ton/blueprint";
import { toNano, Address } from "@ton/core";
import { MagtClaimVault } from "../build/MagtClaimVault_MagtClaimVault.ts";

// Інтерактивний деплой
export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  // 1) Ввід адміна (EQ… / UQ… – дружня адреса)
  const owner = await ui.inputAddress("Admin (owner) address (EQ…):");

  // 2) Ввід комісії за клейм у TON (рядком, напр. "0.05")
  const feeStr = await ui.input("Claim fee in TON (e.g. 0.05):");
  const feeTon = toNano(feeStr); // bigint

  // 3) Підготовка контракту
  const vault = provider.open(await MagtClaimVault.fromInit(owner, feeTon));

  ui.write(`Deploying MagtClaimVault at: ${vault.address.toString()}`);

  // 4) Відправка транзакції деплою
  // value: feeTon + невеликий запас на газ (0.2 TON)
  await vault.send(
  provider.sender(),
  { value: feeTon + toNano("0.2") },
  { $$type: "Deploy", queryId: 0n } // повідомлення деплою (0n = bigint)
);


  ui.write("✅ Deploy sent! Save this address as CLAIM_CONTRACT:");
  ui.write(vault.address.toString());
}
