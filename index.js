const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Redis } = require('@upstash/redis');
const fs = require('fs');
const path = require('path');

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED_REJECTION:', err);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT_EXCEPTION:', err);
});

const bot = new TelegramBot(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());

const ADMIN_ID = process.env.ADMIN_ID || '';
const BOT_USERNAME = process.env.BOT_USERNAME || '';
const PORT = process.env.PORT || 3000;

/*
  Menü fotoğrafı:
  Direct image URL kullanılmalı.
  İstersen env ile değiştirebilirsin:
  MENU_PHOTO_URL
*/
const DEFAULT_MENU_PHOTO_URL = 'https://i.ibb.co/JSLjw7m/B8-D80-FDD-AB82-43-A0-8272-9461-CB1-D932-A.png';
const MENU_PHOTO_URL = process.env.MENU_PHOTO_URL || DEFAULT_MENU_PHOTO_URL;

/*
  Aktivasyon mini app linki:
  İstersen env ile değiştirebilirsin:
  ACTIVATION_MINIAPP_URL
*/
const DEFAULT_ACTIVATION_MINIAPP_URL = 'https://t.me/GorillaCaseBot/app?startapp=r_7190373299';
const ACTIVATION_MINIAPP_URL = process.env.ACTIVATION_MINIAPP_URL || DEFAULT_ACTIVATION_MINIAPP_URL;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SPIN_COST = 50;

// 🎯 Ödüller
const rewards = [
  { amount: 5, chance: 26 },
  { amount: 10, chance: 14 },
  { amount: 35, chance: 10 },
  { amount: 50, chance: 7 },
  { amount: 100, chance: 5 },
  { amount: 150, chance: 3 },
  { amount: 500, chance: 2 },
  { amount: 750, chance: 1 },
  { amount: 850, chance: 0.04 },
  { amount: 950, chance: 0.02 },
  { amount: 1000, chance: 0.01 },
];

function spin() {
  let r = Math.random() * 100;
  let sum = 0;
  for (const item of rewards) {
    sum += item.chance;
    if (r <= sum) return item.amount;
  }
  return 0;
}

function backBtn() {
  return {
    inline_keyboard: [[{ text: '🔙', callback_data: 'menu' }]],
  };
}

function menuKeyboard(u) {
  const t = texts[u.lang] || texts.tr;
  return {
    inline_keyboard: [
      [
        { text: t.play, callback_data: 'play' },
        { text: t.balance, callback_data: 'balance' },
        { text: t.buy, callback_data: 'buy' },
      ],
      [
        { text: t.ref, callback_data: 'ref' },
        { text: t.withdraw, callback_data: 'withdraw' },
        { text: t.my, callback_data: 'my' },
      ],
      [
        { text: t.top, callback_data: 'top' },
        { text: t.lang, callback_data: 'lang' },
      ],
    ],
  };
}

function langKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🇹🇷 TR', callback_data: 'lang_tr' }],
      [{ text: '🇬🇧 EN', callback_data: 'lang_en' }],
      [{ text: '🇷🇺 RU', callback_data: 'lang_ru' }],
    ],
  };
}

function withdrawKeyboard() {
  return {
    inline_keyboard: [
      [15, 25, 50].map((x) => ({ text: `${x}⭐`, callback_data: `w_${x}` })),
      [100, 350, 500].map((x) => ({ text: `${x}⭐`, callback_data: `w_${x}` })),
      [650, 1000].map((x) => ({ text: `${x}⭐`, callback_data: `w_${x}` })),
      [{ text: '🔙', callback_data: 'menu' }],
    ],
  };
}

function buildActivationUrl(token) {
  const base = ACTIVATION_MINIAPP_URL;

  if (!token) return base;

  // URL'de startapp varsa değiştir, yoksa ekle
  if (base.includes('startapp=')) {
    return base.replace(/startapp=([^&]+)/, `startapp=${encodeURIComponent(token)}`);
  }

  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}startapp=${encodeURIComponent(token)}`;
}

function activationKeyboardFull(token) {
  return {
    inline_keyboard: [
      [{ text: '🚀 Mini App Aç', url: buildActivationUrl(token) }],
      [{ text: '✅ Kontrol Et', callback_data: 'check_activation' }],
    ],
  };
}

function activationKeyboardCheckOnly() {
  return {
    inline_keyboard: [
      [{ text: '✅ Kontrol Et', callback_data: 'check_activation' }],
    ],
  };
}

function displayName(user, id) {
  if (!user) return String(id);

  if (user.username && user.username !== 'user') {
    return `@${user.username}`;
  }

  const first = user.first_name || '';
  const last = user.last_name || '';
  const full = `${first} ${last}`.trim();

  if (full) return full;

  return String(id);
}

function nowDateTime() {
  const now = new Date();
  return {
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
  };
}

/* =========================
   HIDDEN PHOTO FOR NON-MENU SCREENS
========================= */
const TMP_DIR = '/tmp';
const HIDDEN_PNG_PATH = path.join(TMP_DIR, 'hidden-1x1.png');
const HIDDEN_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBApQn6XcAAAAASUVORK5CYII=';

try {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(HIDDEN_PNG_PATH)) {
    fs.writeFileSync(HIDDEN_PNG_PATH, Buffer.from(HIDDEN_PNG_BASE64, 'base64'));
  }
} catch (err) {
  console.error('HIDDEN PNG INIT ERROR:', err);
}

/* =========================
   UI HELPERS
========================= */
async function safeDelete(chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, String(messageId));
  } catch (e) {}
}

async function sendMenuCard(chatId, u, prefix = '') {
  const t = texts[u.lang] || texts.tr;
  const caption = `${prefix}${t.menu}`;

  try {
    return await bot.sendPhoto(chatId, MENU_PHOTO_URL, {
      caption,
      reply_markup: menuKeyboard(u),
    });
  } catch (err) {
    console.error('SEND MENU PHOTO FAILED, fallback to text:', err?.message || err);
    return bot.sendMessage(chatId, caption, {
      reply_markup: menuKeyboard(u),
    });
  }
}

async function replaceWithMenu(chatId, messageId, u, prefix = '') {
  const t = texts[u.lang] || texts.tr;
  const caption = `${prefix}${t.menu}`;

  try {
    return await bot.editMessageMedia(
      {
        type: 'photo',
        media: MENU_PHOTO_URL,
        caption,
      },
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: menuKeyboard(u),
      }
    );
  } catch (err) {
    console.error('EDIT MENU PHOTO FAILED, fallback to text:', err?.message || err);
    try {
      return await bot.editMessageText(caption, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: menuKeyboard(u),
      });
    } catch (e) {
      console.error('EDIT MENU TEXT FAILED:', e?.message || e);
    }
  }
}

async function replaceWithText(chatId, messageId, text, replyMarkup) {
  try {
    return await bot.editMessageMedia(
      {
        type: 'photo',
        media: HIDDEN_PNG_PATH,
        caption: text,
      },
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }
    );
  } catch (err) {
    console.error('EDIT TEXT PHOTO FAILED, fallback to text:', err?.message || err);
    try {
      return await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      });
    } catch (e) {
      console.error('EDIT TEXT FALLBACK FAILED:', e?.message || e);
    }
  }
}

async function sendActivationPrompt(chatId, u) {
  const text = 'Botu aktif etmek için mini app\'i açın.';
  return bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: activationKeyboardFull(u.activation_token).inline_keyboard,
    },
  });
}

async function sendActivationWaiting(chatId, u) {
  const text = '⏳ Aktivasyon bekleniyor.';
  return bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: activationKeyboardCheckOnly().inline_keyboard,
    },
  });
}

/* =========================
   USER STORAGE
========================= */
async function getUser(id) {
  let u = await redis.get(`user:${id}`);
  if (!u) return null;

  if (typeof u.refs !== 'number') u.refs = 0;
  if (typeof u.stars !== 'number') u.stars = 0;
  if (typeof u.waiting !== 'boolean') u.waiting = false;
  if (!u.lang) u.lang = 'tr';
  if (!u.username) u.username = 'user';
  if (!u.first_name) u.first_name = '';
  if (!u.last_name) u.last_name = '';
  if (typeof u.activated !== 'boolean') u.activated = false;
  if (typeof u.activation_prompted !== 'boolean') u.activation_prompted = false;
  if (!u.activation_token) u.activation_token = null;

  return u;
}

async function saveUser(id, data) {
  await redis.set(`user:${id}`, data);

  // leaderboard
  await redis.zadd('leaderboard', {
    score: data.stars,
    member: id.toString(),
  });
}

/* =========================
   REQUEST STORAGE
========================= */
async function getRequests(id) {
  const r = await redis.get(`req_${id}`);
  return r || [];
}

async function saveRequest(id, data) {
  const list = (await redis.get(`req_${id}`)) || [];
  list.push(data);
  await redis.set(`req_${id}`, list);
}

/* =========================
   TEXTS
========================= */
const texts = {
  tr: {
    menu: '🎰 Menü',
    play: '🎮 Oyna (50⭐)',
    balance: '⭐ Bakiye',
    buy: '💰 Yükle',
    ref: '👥 Davet',
    withdraw: '💸 Çek',
    my: '📄 Taleplerim',
    top: '🏆 Liderler',
    lang: '🌍 Dil',
    withdrawMenu: '💸 Çekim miktarı seç',
    noMoney: '❌ Yetersiz bakiye',
    spinning: '🎰 Çark dönüyor...',
    lose: '😢 Kaybettin',
    win: (x) => `🎉 +${x}⭐`,
    ask: '💰 Miktarı yaz (25-10000)',
    requestPending: '⏳ Bekleniyor',
    myEmpty: '❌ Henüz talep yok',
    topEmpty: '❌ Liste boş',
  },
  en: {
    menu: '🎰 Menu',
    play: '🎮 Play (50⭐)',
    balance: '⭐ Balance',
    buy: '💰 Deposit',
    ref: '👥 Invite',
    withdraw: '💸 Withdraw',
    my: '📄 My requests',
    top: '🏆 Leaderboard',
    lang: '🌍 Language',
    withdrawMenu: '💸 Choose withdraw amount',
    noMoney: '❌ Not enough balance',
    spinning: '🎰 Spinning...',
    lose: '😢 Lost',
    win: (x) => `🎉 +${x}⭐`,
    ask: '💰 Type amount (25-10000)',
    requestPending: '⏳ Pending',
    myEmpty: '❌ No requests yet',
    topEmpty: '❌ Leaderboard is empty',
  },
  ru: {
    menu: '🎰 Меню',
    play: '🎮 Играть (50⭐)',
    balance: '⭐ Баланс',
    buy: '💰 Пополнить',
    ref: '👥 Пригласить',
    withdraw: '💸 Вывод',
    my: '📄 Мои заявки',
    top: '🏆 Топ',
    lang: '🌍 Язык',
    withdrawMenu: '💸 Выбери сумму вывода',
    noMoney: '❌ Недостаточно средств',
    spinning: '🎰 Крутится...',
    lose: '😢 Проигрыш',
    win: (x) => `🎉 +${x}⭐`,
    ask: '💰 Введите сумму (25-10000)',
    requestPending: '⏳ В ожидании',
    myEmpty: '❌ Заявок пока нет',
    topEmpty: '❌ Топ пуст',
  },
};

/* =========================
   START + REF
========================= */
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  try {
    const id = msg.chat.id;
    const ref = match && match[1] ? String(match[1]) : '';
    const username = msg.from?.username || 'user';
    const firstName = msg.from?.first_name || '';
    const lastName = msg.from?.last_name || '';

    let u = await getUser(id);

    if (!u) {
      u = {
        stars: 100,
        refs: 0,
        lang: 'tr',
        username,
        first_name: firstName,
        last_name: lastName,
        waiting: false,
        activated: false,
        activation_prompted: false,
        activation_token: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      };

      await saveUser(id, u);

      if (ref && ref !== String(id)) {
        const refUser = await getUser(ref);
        if (refUser) {
          refUser.stars += 1.5;
          refUser.refs += 1;
          await saveUser(ref, refUser);
        }
      }
    } else {
      u.username = username;
      u.first_name = firstName;
      u.last_name = lastName;
      if (!u.lang) u.lang = 'tr';
      if (!u.activation_token) {
        u.activation_token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }
      await saveUser(id, u);
    }

    // İlk girişte yalnızca bir kez aktivasyon sor
    if (!u.activated) {
      if (!u.activation_prompted) {
        u.activation_prompted = true;
        await saveUser(id, u);
        return sendActivationPrompt(id, u);
      }

      // Sonraki /start’larda tekrar “açın” diye sormasın
      return sendActivationWaiting(id, u);
    }

    return sendMenuCard(id, u);
  } catch (err) {
    console.error('START ERROR:', err);
  }
});

/* =========================
   BUY INPUT + WEB APP DATA
========================= */
bot.on('message', async (msg) => {
  try {
    const id = msg.chat.id;
    let u = await getUser(id);
    if (!u) return;

    // Mini App data geldiyse aktivasyon kontrolü
    if (msg.web_app_data?.data) {
      let payload = null;

      try {
        payload = JSON.parse(msg.web_app_data.data);
      } catch (e) {
        payload = { raw: msg.web_app_data.data };
      }

      if (
        payload &&
        (payload.type === 'activated' || payload.action === 'activated') &&
        payload.token &&
        payload.token === u.activation_token
      ) {
        u.activated = true;
        u.activation_prompted = true;
        await saveUser(id, u);

        return sendMenuCard(id, u, '✅ Aktivasyon tamamlandı\n\n');
      }

      return;
    }

    const text = (msg.text || '').trim();
    if (!u.waiting) return;

    if (!/^\d+$/.test(text)) return;

    const n = parseInt(text, 10);
    if (n >= 25 && n <= 10000) {
      u.stars += n;
      u.waiting = false;
      await saveUser(id, u);

      return sendMenuCard(id, u, `✅ +${n}⭐\n\n`);
    }
  } catch (err) {
    console.error('MESSAGE INPUT ERROR:', err);
  }
});

/* =========================
   CALLBACKS
========================= */
bot.on('callback_query', async (q) => {
  try {
    await bot.answerCallbackQuery(q.id);
  } catch (e) {}

  try {
    const id = q.message.chat.id;
    const mid = q.message.message_id;
    const data = q.data;

    let u = await getUser(id);
    if (!u) return;

    const t = texts[u.lang] || texts.tr;

    // Activation check
    if (data === 'check_activation') {
      if (u.activated) {
        await safeDelete(id, mid);
        return sendMenuCard(id, u);
      }

      return bot.answerCallbackQuery(q.id, {
        text: 'Mini App henüz açılmadı.',
        show_alert: false,
      });
    }

    // PLAY
    if (data === 'play') {
      if (u.stars < SPIN_COST) {
        return replaceWithText(id, mid, t.noMoney, backBtn());
      }

      u.stars -= SPIN_COST;
      await saveUser(id, u);

      await replaceWithText(id, mid, t.spinning, null);

      await new Promise((r) => setTimeout(r, 1000));

      let win = spin();
      if (win > 0) u.stars += win;

      await saveUser(id, u);

      return replaceWithText(
        id,
        mid,
        win > 0 ? `${t.win(win)}\n⭐ ${u.stars}` : `${t.lose}\n⭐ ${u.stars}`,
        backBtn()
      );
    }

    // BALANCE
    if (data === 'balance') {
      return replaceWithText(
        id,
        mid,
        `⭐ ${u.stars}\n👥 ${u.refs}`,
        backBtn()
      );
    }

    // BUY
    if (data === 'buy') {
      u.waiting = true;
      await saveUser(id, u);

      return replaceWithText(
        id,
        mid,
        t.ask,
        backBtn()
      );
    }

    // REF
    if (data === 'ref') {
      const link = BOT_USERNAME
        ? `https://t.me/${BOT_USERNAME}?start=${id}`
        : `https://t.me/?start=${id}`;

      return replaceWithText(
        id,
        mid,
        `${link}\n👥 ${u.refs}`,
        backBtn()
      );
    }

    // WITHDRAW MENU
    if (data === 'withdraw') {
      return replaceWithText(
        id,
        mid,
        t.withdrawMenu,
        withdrawKeyboard()
      );
    }

    // CREATE REQUEST
    if (data.startsWith('w_')) {
      const amount = parseInt(data.split('_')[1], 10);

      if (!amount || u.stars < amount) {
        return replaceWithText(id, mid, t.noMoney, backBtn());
      }

      u.stars -= amount;
      await saveUser(id, u);

      const reqId = await redis.incr('req_id');
      const { date, time } = nowDateTime();

      const req = {
        id: reqId,
        amount,
        date,
        time,
        status: 'pending',
      };

      await saveRequest(id, req);

      if (ADMIN_ID) {
        try {
          const name = displayName(u, id);
          await bot.sendMessage(
            ADMIN_ID,
            `💸 NEW REQUEST\n\n#${reqId}\n👤 ${name}\n🆔 ${id}\n⭐ ${amount}\n📅 ${date} ${time}`
          );
        } catch (err) {
          console.error('ADMIN NOTIFY ERROR:', err);
        }
      }

      return replaceWithText(
        id,
        mid,
        `#${reqId}\n${amount}⭐\n${date} ${time}\n⏳ ${t.requestPending}`,
        backBtn()
      );
    }

    // MY REQUESTS
    if (data === 'my') {
      const list = await getRequests(id);

      if (!list.length) {
        return replaceWithText(id, mid, t.myEmpty, backBtn());
      }

      let text = '';
      for (const r of list) {
        const status = r.status === 'pending' ? t.requestPending : String(r.status || '');
        text += `#${r.id} - ${r.amount}⭐ - ${status}\n`;
      }

      return replaceWithText(id, mid, text.trim(), backBtn());
    }

    // LEADERBOARD
    if (data === 'top') {
      const top = await redis.zrange('leaderboard', 0, 9, { rev: true });

      if (!top || !top.length) {
        return replaceWithText(id, mid, t.topEmpty, backBtn());
      }

      let text = `${t.top}\n\n`;

      for (let i = 0; i < top.length; i++) {
        const uid = top[i];
        const user = await getUser(uid);

        let name = String(uid);
        if (user) {
          if (user.username && user.username !== 'user') {
            name = `@${user.username}`;
          } else if (user.first_name) {
            name = user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name;
          }
        }

        text += `${i + 1}. ${name} - ⭐ ${user?.stars || 0}\n`;
      }

      return replaceWithText(id, mid, text.trim(), backBtn());
    }

    // LANG MENU
    if (data === 'lang') {
      return replaceWithText(
        id,
        mid,
        '🌍',
        { inline_keyboard: langKeyboard().inline_keyboard }
      );
    }

    if (data.startsWith('lang_')) {
      u.lang = data.split('_')[1] || 'tr';
      await saveUser(id, u);

      return replaceWithMenu(id, mid, u);
    }

    // MENU
    if (data === 'menu') {
      return replaceWithMenu(id, mid, u);
    }
  } catch (err) {
    console.error('CALLBACK ERROR:', err);
  }
});

/* =========================
   SERVER
========================= */
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log('Server running ' + PORT);
});
