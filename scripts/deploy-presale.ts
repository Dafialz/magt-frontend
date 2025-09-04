import { Address, toNano } from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import { MagtPresale } from "../build/MagtPresale_MagtPresale";

// Адреси власника (адміна) та скарбниці (куди збираємо TON)
const OWNER    = Address.parse("UQBDooPilphbndrSB1RdtkyZrnWctibsl356IvU7_jOxh4UT");
const TREASURY = Address.parse("UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD");

// Десятковість MAGT
const DECIMALS = 9n;

// Реферальний бонус у bps (10000 = 100%). 500 = 5%
const REF_BPS = 500;

// Рівні у «людському» вигляді (токени без десяткових; price — у TON як рядок)
const LEVELS_HUMAN: { tokens: number; price: string }[] = [
  { tokens: 65_225_022, price: "0.011490" },
  { tokens: 57_039_669, price: "0.013443" },
  { tokens: 50_370_908, price: "0.015729" },
  { tokens: 44_326_399, price: "0.018402" },
  { tokens: 39_007_231, price: "0.021531" },
  { tokens: 34_326_365, price: "0.025191" },
  { tokens: 30_207_200, price: "0.029472" },
  { tokens: 26_582_336, price: "0.034482" },
  { tokens: 23_392_455, price: "0.040344" },
  { tokens: 20_585_361, price: "0.047205" },
  { tokens: 18_115_117, price: "0.055230" },
  { tokens: 15_941_303, price: "0.064617" },
  { tokens: 14_028_347, price: "0.075603" },
  { tokens: 12_344_945, price: "0.088455" },
  { tokens: 10_863_552, price: "0.103494" },
  { tokens:  9_559_925, price: "0.121086" },
  { tokens:  8_412_734, price: "0.141672" },
  { tokens:  7_423_267, price: "0.165756" },
  { tokens:  6_514_821, price: "0.193935" },
  { tokens:  5_733_043, price: "0.226902" },
];

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  // Перерахунок у RAW (для контракту): MAGT * 10^decimals; ціна в nanoTON
  const per = 10n ** DECIMALS;
  const levels = new Map<number, { tokens: bigint; price: bigint }>();
  LEVELS_HUMAN.forEach((lv, i) => {
    const tokensRaw = BigInt(lv.tokens) * per; // MAGT у сирих одиницях
    const priceNano = toNano(lv.price);        // nanoTON за 1 MAGT
    levels.set(i, { tokens: tokensRaw, price: priceNano });
  });

  // Створюємо екземпляр пресейлу з параметрами init (додаємо refBps)
  const presale = provider.open(
    await MagtPresale.fromInit(
      OWNER,
      TREASURY,
      Number(DECIMALS),
      levels as any,            // біндінги приймають map<Int, Level>
      LEVELS_HUMAN.length,
      REF_BPS
    )
  );

  ui.write(`Presale will be deployed at: ${presale.address.toString()}`);

  // Деплой (≈0.25 TON має вистачити з запасом)
  await presale.sendDeploy(provider.sender(), { value: toNano("0.25") });

  ui.write(
    "✅ Presale deployed.\n" +
    "Next:\n" +
    "1) Надішли трохи MAGT на адресу пресейлу (щоб створився його JettonWallet).\n" +
    "2) Виконай admin.ts -> SetJettonWallet (передай адресу JW пресейлу).\n" +
    "3) Користувачі можуть купувати: просто надсилають TON на адресу пресейлу або викликають buy-ton.ts.\n" +
    "   Для реферала використовуйте повідомлення Buy з ref-адресою, або сформуйте посилання/кнопку з ref."
  );
}
