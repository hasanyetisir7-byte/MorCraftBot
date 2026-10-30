const mineflayer = require("mineflayer");
const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");

const app = express();
app.use(express.json({ limit: "10kb" }));

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://hasanyetisir7-byte.github.io";
const HOST = process.env.MC_HOST || "MorCraftSmp.aternos.me";
const MC_PORT = Number(process.env.MC_PORT || 64006);
const BOT_USERNAME = process.env.BOT_USERNAME || "MorCraftBot";

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
  console.error("HATA: ADMIN_PASSWORD ortam değişkenini en az 16 karakter olacak şekilde ayarla.");
  process.exit(1);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === ALLOWED_ORIGIN) return callback(null, true);
    return callback(new Error("Origin izinli değil."));
  },
  credentials: false
}));

const sessions = new Map();
const loginAttempts = new Map();
const chatHistory = [];
const MAX_CHAT = 100;
let bot = null;
let connecting = false;
let reconnectTimer = null;
let reconnectDelay = 15000;
let connectedAt = 0;
let stoppedByAdmin = false;
let lastError = null;

function addLog(username, message) {
  chatHistory.push({ username, message: String(message).slice(0, 300), time: new Date().toISOString() });
  if (chatHistory.length > MAX_CHAT) chatHistory.shift();
}

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
  return token;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş. Yeniden giriş yap." });
  }
  req.sessionToken = token;
  next();
}

function scheduleReconnect(minDelay = 0) {
  if (stoppedByAdmin || reconnectTimer) return;
  const delay = Math.max(reconnectDelay, minDelay);
  reconnectDelay = Math.min(Math.max(reconnectDelay * 2, 15000), 300000);
  addLog("Sistem", "Yeniden bağlanmadan önce " + Math.ceil(delay / 1000) + " saniye beklenecek.");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBot();
  }, delay);
}

function connectBot() {
  if (bot || connecting || stoppedByAdmin) return;
  connecting = true;
  lastError = null;
  addLog("Sistem", "Minecraft sunucusuna bağlanılıyor...");

  let newBot;
  try {
    newBot = mineflayer.createBot({
      host: HOST,
      port: MC_PORT,
      username: BOT_USERNAME,
      auth: "offline"
    });
    bot = newBot;
  } catch (error) {
    connecting = false;
    bot = null;
    lastError = error.message;
    addLog("Sistem", "Bot başlatılamadı: " + error.message);
    scheduleReconnect();
    return;
  }

  newBot.once("login", () => {
    connecting = false;
    connectedAt = Date.now();
    lastError = null;
    addLog("Sistem", "MorCraftBot sunucuya bağlandı.");
  });

  newBot.on("playerJoined", player => addLog("Sistem", player.username + " sunucuya katıldı."));
  newBot.on("playerLeft", player => addLog("Sistem", player.username + " sunucudan ayrıldı."));
  newBot.on("chat", (username, message) => addLog(username, message));

  newBot.on("kicked", reason => {
    const text = typeof reason === "string" ? reason : JSON.stringify(reason);
    lastError = "Sunucudan atıldı: " + text;
    addLog("Sistem", lastError);
  });

  newBot.on("error", error => {
    lastError = error.message;
    addLog("Sistem", "Bağlantı hatası: " + error.message);
  });

  newBot.once("end", () => {
    if (bot === newBot) bot = null;
    connecting = false;
    if (connectedAt && Date.now() - connectedAt >= 120000) {
      reconnectDelay = 15000;
    }
    connectedAt = 0;
    addLog("Sistem", "Bot bağlantısı kapandı.");
    // Kısa aralıklarla başarısız olan bağlantılarda bekleme süresini artır.
    scheduleReconnect();
  });
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/login", (req, res) => {
  const ip = req.ip || "unknown";
  const attempt = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (attempt.until > Date.now()) {
    return res.status(429).json({ error: "Çok fazla deneme. Birkaç dakika sonra tekrar dene." });
  }

  const password = req.body && req.body.password;
  const valid = typeof password === "string" &&
    Buffer.byteLength(password) === Buffer.byteLength(ADMIN_PASSWORD) &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD));

  if (!valid) {
    attempt.count += 1;
    if (attempt.count >= 5) {
      attempt.count = 0;
      attempt.until = Date.now() + 5 * 60 * 1000;
    }
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ error: "Şifre yanlış." });
  }

  loginAttempts.delete(ip);
  return res.json({ token: createSession(), expiresIn: 43200 });
});

app.post("/api/logout", requireAuth, (req, res) => {
  sessions.delete(req.sessionToken);
  res.json({ ok: true });
});

app.get("/api/status", requireAuth, (_req, res) => {
  const players = bot && bot.players ? Object.keys(bot.players) : [];
  res.json({
    botOnline: Boolean(bot && bot.player),
    connecting,
    playerCount: players.length,
    players,
    lastError
  });
});

app.get("/api/chat", requireAuth, (req, res) => {
  const since = Number(req.query.since || 0);
  res.json({ messages: chatHistory.slice(Math.max(0, since)) });
});

app.post("/api/chat", requireAuth, (req, res) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 200) return res.status(400).json({ error: "Mesaj 1-200 karakter olmalı." });
  if (!bot || !bot.player) return res.status(409).json({ error: "Bot şu anda çevrimiçi değil." });
  bot.chat(message);
  addLog("MorCraftBot", message);
  res.json({ ok: true });
});

app.post("/api/bot/start", requireAuth, (_req, res) => {
  stoppedByAdmin = false;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  connectBot();
  res.json({ ok: true, message: "Bağlantı denemesi başlatıldı." });
});

app.post("/api/bot/stop", requireAuth, (_req, res) => {
  stoppedByAdmin = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (bot) {
    const oldBot = bot;
    bot = null;
    oldBot.quit("Yönetici tarafından durduruldu.");
  }
  connecting = false;
  addLog("Sistem", "Bot yönetici tarafından durduruldu.");
  res.json({ ok: true });
});

app.post("/api/kick", requireAuth, (req, res) => {
  const player = typeof req.body.player === "string" ? req.body.player.trim() : "";
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 80) : "Yönetici kararı";
  if (!/^[A-Za-z0-9_]{1,16}$/.test(player)) {
    return res.status(400).json({ error: "Geçerli bir Minecraft oyuncu adı gir." });
  }
  if (!bot || !bot.player) return res.status(409).json({ error: "Bot sunucuya bağlı değil." });
  bot.chat("/kick " + player + " " + reason);
  addLog("Sistem", "Kick komutu gönderildi: " + player + ". Botun yetkisi yoksa komut uygulanmaz.");
  res.json({ ok: true, note: "Komut gönderildi. Botun sunucuda gerekli yetkisi olmalı." });
});

app.listen(PORT, () => {
  console.log("MorCraftBot API " + PORT + " portunda çalışıyor.");
  connectBot();
});
