// api-override.js
window.MAGT_API = {
  // якщо є проксі на Render — краще використовувати його і не світити ключ у фронті
  RPC_URL: "https://testnet.toncenter.com/api/v2/jsonRPC",
  TONCENTER_KEY: "", // порожньо у фронті; ключ краще на бек-проксі

  // твій тестнетний minter і burn
  JETTON_MINTER: "EQAVgsA0phnUd8KZULsT59z9Buvqx8w1yeFA_bukYi5tI7Nq",
  BURN: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
  DECIMALS: 9
};
