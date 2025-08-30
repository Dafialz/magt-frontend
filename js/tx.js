import { ADDR, DECIMALS, FORWARD_TON_AMOUNT, TONAPI } from './config.js';
import { connector, userAddress } from './ton.js';

// знайти адресу Jetton Wallet користувача для USDT
async function getUserJettonWallet(ownerRaw, jettonMaster){
  const url = `${TONAPI.base}/v2/jettons/wallets?owner=${ownerRaw}&jetton=${jettonMaster}`;
  const headers = TONAPI.apiKey ? { 'Authorization': TONAPI.apiKey } : {};
  const r = await fetch(url, { headers });
  if(!r.ok) throw new Error('TonAPI error: ' + r.status);
  const j = await r.json();
  // різні версії TonAPI повертають різні поля → пробуємо кілька
  return j?.wallets?.[0]?.address || j?.addresses?.[0]?.address || j?.address;
}

// побудувати body для Jetton transfer (TEP-74)
async function buildJettonTransferBody({ jetAmount, toAddr, responseAddr, referrer }){
  const Cell = TonWeb.boc.Cell;
  const Address = TonWeb.utils.Address;

  const body = new Cell();
  body.bits.writeUint(0x0f8a7ea5, 32);          // transfer op
  body.bits.writeUint(0, 64);                    // query_id
  body.bits.writeUint(jetAmount, 128);           // amount (USDT in jet units)
  body.bits.writeAddress(new Address(toAddr));   // destination = пресейл
  body.bits.writeAddress(new Address(responseAddr)); // response_destination
  body.bits.writeBit(0);                         // no custom_payload
  body.bits.writeCoins(TonWeb.utils.toNano('0.05')); // forward_ton_amount (0.05 TON)

  // forward_payload: кладемо реферала
  const fwd = new Cell();
  if(referrer){
    // теги 'REF' + адреса у тексті — просто для демо; на проді бажано парсити адресу як MsgAddress
    const bytes = new TextEncoder().encode('ref:' + referrer);
    fwd.bits.writeBytes(bytes);
  }
  body.refs.push(fwd);

  const boc = await body.toBoc(false);
  return TonWeb.utils.bytesToBase64(boc);
}

// відправити транзакцію через TonConnect
export async function sendUsdtWithRef({ usdFloat, referrer }){
  const owner = userAddress();
  if(!owner) throw new Error('Wallet not connected');

  // 1) знаходимо адресу Jetton Wallet користувача для USDT
  const jetWallet = await getUserJettonWallet(owner, ADDR.USDT_MASTER);
  if(!jetWallet) throw new Error('USDT wallet not found');

  // 2) amount у jetton (6 знаків)
  const jetAmount = BigInt(Math.floor(usdFloat * 10 ** DECIMALS.USDT));

  // 3) будуємо body
  const payload = await buildJettonTransferBody({
    jetAmount,
    toAddr: ADDR.PRESALE,
    responseAddr: owner,
    referrer
  });

  // 4) шлемо повідомлення на jetton wallet користувача
  const tx = {
    validUntil: Math.floor(Date.now()/1000) + 300,
    messages: [{
      address: jetWallet,
      amount: FORWARD_TON_AMOUNT, // TON на газ для Jetton Wallet
      payload
    }]
  };

  await connector.sendTransaction(tx);
  return { jetWallet, sent: true };
}
