// scripts/deploy-presale.ts
import {
  Address,
  toNano,
  Dictionary,
  type DictionaryValue,
  type DictionaryKey,
} from "@ton/core";
import { NetworkProvider } from "@ton/blueprint";
import {
  MagtPresale,
  type Level, // { $$type:'Level', tokens: bigint, price: bigint }
} from "../build/MagtPresale_MagtPresale";

// Адреси власника (адміна) та скарбниці (куди збираємо TON)
const OWNER = Address.parse("UQBDooPilphbndrSB1RdtkyZrnWctibsl356IvU7_jOxh4UT");
const TREASURY = Address.parse("UQA1VwosHe3LfztkzNJ47UHndev9MbRTcdGHM_qjSpLRa4XD");

// Десятковість MAGT (Int у Tact → bigint у TS)
const DECIMALS = 9n;

// Реферальний бонус у bps (10000 = 100%). 500 = 5% (bigint)
const REF_BPS = 500n;

// Рівні у «людському» вигляді (токени без десяткових; price — у TON як рядок)
const LEVELS_HUMAN: { tokens: number; price: string }[] = [
  { tokens: 65_225_022, price: "0.003830" },
  { tokens: 57_039_669, price: "0.004481" },
  { tokens: 50_370_908, price: "0.005243" },
  { tokens: 44_326_399, price: "0.006134" },
  { tokens: 39_007_231, price: "0.007177" },
  { tokens: 34_326_365, price: "0.008397" },
  { tokens: 30_207_200, price: "0.009824" },
  { tokens: 26_582_336, price: "0.011494" },
  { tokens: 23_392_455, price: "0.013448" },
  { tokens: 20_585_361, price: "0.015735" },
  { tokens: 18_115_117, price: "0.018410" },
  { tokens: 15_941_303, price: "0.021539" },
  { tokens: 14_028_347, price: "0.025201" },
  { tokens: 12_344_945, price: "0.029485" },
  { tokens: 10_863_552, price: "0.034498" },
  { tokens: 9_559_925, price: "0.040362" },
  { tokens: 8_412_734, price: "0.047224" },
  { tokens: 7_423_267, price: "0.055252" },
  { tokens: 6_514_821, price: "0.064645" },
  { tokens: 5_733_043, price: "0.075634" },
];

export async function run(provider: NetworkProvider) {
  const ui = provider.ui();

  // Перерахунок у RAW (для контракту): MAGT * 10^decimals; ціна в nanoTON
  const per = 10n ** DECIMALS;

  // Codec для struct Level у словнику (ключі — Int(257) => bigint)
  const LevelValue: DictionaryValue<Level> = {
    serialize: (src, b) => {
      b.storeInt(src.tokens, 257);
      b.storeInt(src.price, 257);
    },
    parse: (slice) => ({
      $$type: "Level",
      tokens: slice.loadIntBig(257),
      price: slice.loadIntBig(257),
    }),
  };

  // Словник рівнів: key=bigint (0..n-1), value=Level
  const levels = Dictionary.empty<bigint, Level>(
    // Важливо: тут використовуємо тип DictionaryKey з @ton/core,
    // а не "Dictionary.DictionaryKey<...>", щоб уникнути помилки TS2702.
    Dictionary.Keys.Int(257) as unknown as DictionaryKey<bigint>,
    LevelValue
  );

  LEVELS_HUMAN.forEach((lv, i) => {
    const tokensRaw = BigInt(lv.tokens) * per; // MAGT у «raw»
    const priceNano = toNano(lv.price); // nanoTON за 1 MAGT
    levels.set(BigInt(i), {
      $$type: "Level",
      tokens: tokensRaw,
      price: priceNano,
    });
  });

  // Створюємо екземпляр пресейлу з параметрами init
  const presale = provider.open(
    await MagtPresale.fromInit(
      OWNER,
      TREASURY,
      DECIMALS, // decimals
      levels, // Dictionary<Int, Level>
      BigInt(LEVELS_HUMAN.length), // levelsCount
      REF_BPS // refBps
    )
  );

  ui.write(`Presale will be deployed at: ${presale.address.toString()}`);

  // Деплой контракту (звичайний send з повідомленням Deploy)
  await presale.send(
    provider.sender(),
    { value: toNano("0.25") },
    { $$type: "Deploy", queryId: 0n }
  );

  ui.write(
    "✅ Presale deployed.\n" +
      "Next:\n" +
      "1) Надішли трохи MAGT на адресу пресейлу (щоб створився його JettonWallet).\n" +
      "2) Виконай admin.ts -> SetJettonWallet (передай адресу JW пресейлу).\n" +
      "3) Користувачі можуть купувати: просто надсилають TON на адресу пресейлу або викликають buy-ton.ts.\n" +
      "   Для реферала використовуйте повідомлення Buy з ref-адресою, або сформуйте посилання/кнопку з ref."
  );
}
