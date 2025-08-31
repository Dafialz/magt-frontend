// /purchases.js
import fs from "fs";
import path from "path";
import express from "express";

const router = express.Router();
const DATA_FILE = path.join(process.cwd(), "purchases.json");

// завантажити існуючі покупки
let purchases = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    purchases = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }
} catch (e) {
  console.error("Не вдалося прочитати purchases.json:", e);
  purchases = [];
}

// зберегти у файл
function savePurchases() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(purchases, null, 2));
  } catch (e) {
    console.error("Не вдалося зберегти purchases.json:", e);
  }
}

// POST /api/purchase
router.post("/", (req, res) => {
  try {
    const { usd, tokens, address, ref } = req.body;
    if (!usd || !tokens || !address) {
      return res.status(400).json({ ok: false, error: "bad params" });
    }

    const tx = {
      ts: Date.now(),
      usd: Number(usd),
      tokens: Number(tokens),
      address: String(address),
      ref: ref ? String(ref) : null,
    };

    purchases.unshift(tx); // додаємо у початок списку
    if (purchases.length > 500) purchases.length = 500; // ліміт історії
    savePurchases();

    res.json({ ok: true, saved: tx });
  } catch (e) {
    console.error("Помилка POST /purchase:", e);
    res.status(500).json({ ok: false, error: "server error" });
  }
});

// GET /api/purchase?limit=20
router.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json(purchases.slice(0, limit));
});

export default router;
