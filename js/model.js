import { MODEL } from './config.js';

function calcTokensPerLevel(total, n, q){
  const pow = Math.pow;
  const T0 = total * (1 - q) / (1 - pow(q, n));
  let raw = Array.from({length:n}, (_,i)=> T0 * pow(q, i));
  let ints = raw.map(x=>Math.round(x));
  let diff = total - ints.reduce((a,b)=>a+b,0);
  for(let i=0; i<Math.abs(diff); i++){ const idx = i % n; ints[idx] += (diff>0?1:-1); }
  return ints;
}
function calcPricesUSD(tokens, r, targetUSD){
  const denom = tokens.reduce((s,t,i)=> s + t * Math.pow(r, i), 0);
  const p0 = targetUSD / denom;
  return tokens.map((_,i)=> p0 * Math.pow(r, i));
}

const TOKENS = calcTokensPerLevel(MODEL.totalTokens, MODEL.levels, MODEL.q);
const PRICES = calcPricesUSD(TOKENS, MODEL.r, MODEL.targetUSD);

export const LEVELS = TOKENS.map((t,i)=>({ n:i+1, mag:t, price:PRICES[i], revenue:t*PRICES[i] }));
