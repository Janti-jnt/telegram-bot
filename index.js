const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Redis } = require('@upstash/redis');

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
  Direct image URL:
  https://i.ibb.co/JSLjw7m/B8-D80-FDD-AB82-43-A0-8272-9461-CB1-D932-A.png

  Bunu env ile değiştirmek istersen MENU_PHOTO_URL koyabilirsin.
  Sayfa linki değil, direkt image link olmalı.
*/
const DEFAULT_MENU_PHOTO_URL = 'https://i.ibb.co/JSLjw7m/B8-D80-FDD-AB82-43-A0-8272-9461-CB1-D932-A.png';
const MENU_PHOTO_URL = process.env.MENU_PHOTO_URL || DEFAULT_MENU_PHOTO_URL;

let MENU_MODE = MENU_PHOTO_URL ? 'photo' : 'text';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SPIN_COST = 50;

// 🎯 REWARDS
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
    inline_keyboard: [
      [{ text: '🔙', callback_data: 'menu' }],
    ],
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

function formatDateTime() {
  const now = new Date();
  return {
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
  };
}

function displayName(user, id) {
  if (!user) return 'user';

  if (user.username && user.username !== 'user') {
    return `@${user.username}`;
  }

  const first = user.first_name || '';
  const last = user.last_name || '';
  const full = `${first} ${last}`.trim();

  if (full) return full;

  return 'user';
}

async function sendMenuCard(chatId, u, prefix = '') {
  const t = texts[u.lang] || texts.tr;
  const text = `${prefix}${t.menu}`;

  const options = {
    reply_markup: {
      inline_keyboard: menuKeyboard(u).inline_keyboard,
    },
  };

  if (MENU_MODE === 'photo' && MENU_PHOTO_URL) {
    try {
      return await bot.sendPhoto(chatId, MENU_PHOTO_URL, {
        caption: text,
        ...options,
      });
    } catch (err) {
      console.error('MENU PHOTO FAILED, switching to text mode:', err?.message || err);
      MENU_MODE = 'text';
    }
  }

  return bot.sendMessage(chatId, text, options);
}

async function editCurrentCard(chatId, messageId, text, replyMarkup) {
  if (MENU_MODE === 'photo') {
    try {
      return await bot.editMessageCaption(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      });
    } catch (err) {
      console.error('EDIT CAPTION FAILED, switching to text mode:', err?.message || err);
      MENU_MODE = 'text';
    }
  }

  return bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

// USER
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

  return u;
}

async function saveUser(id, data) {
  await redis.set(`user:${id}`, data);

  // Leaderboard update
  await redis.zadd('leaderboard', {
    score: data.stars,
    member: id.toString(),
  });
}

// REQUESTS
async function getRequests(id) {
  const r = await redis.get(`req_${id}`);
  return r || [];
}

async function saveRequest(id, data) {
  const list = (await redis.get(`req_${id}`)) || [];
  list.push(data);
  await redis.set(`req_${id}`, list);
}

// TEXTS
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

// START + REF
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
      await saveUser(id, u);
    }

    await sendMenuCard(id, u);
  } catch (err) {
    console.error('START ERROR:', err);
  }
});

// BUY INPUT
bot.on('message', async (msg) => {
  try {
    const id = msg.chat.id;
    const text = (msg.text || '').trim();

    const u = await getUser(id);
    if (!u || !u.waiting) return;

    if (!/^\d+$/.test(text)) return;

    const n = parseInt(text, 10);

    if (n >= 25 && n <= 10000) {
      u.stars += n;
      u.waiting = false;
      await saveUser(id, u);

      // success + menu
      return await sendMenuCard(id, u, `✅ +${n}⭐\n\n`);
    }
  } catch (err) {
    console.error('MESSAGE INPUT ERROR:', err);
  }
});

// CALLBACKS
bot.on('callback_query', async (q) => {
  try {
    await bot.answerCallbackQuery(q.id);
  } catch (e) {}

  try {
    const id = q.message.chat.id;
    const mid = q.message.message_id;
    const data = q.data;

    const u = await getUser(id);
    if (!u) return;

    const t = texts[u.lang] || texts.tr;

    // PLAY
    if (data === 'play') {
      if (u.stars < SPIN_COST) {
        return editCurrentCard(id, mid, t.noMoney, backBtn());
      }

      u.stars -= SPIN_COST;
      await saveUser(id, u);

      await editCurrentCard(id, mid, t.spinning, null);

      await new Promise((r) => setTimeout(r, 1000));

      let win = spin();
      if (win > 0) u.stars += win;

      await saveUser(id, u);

      return editCurrentCard(
        id,
        mid,
        win > 0 ? `${t.win(win)}\n⭐ ${u.stars}` : `${t.lose}\n⭐ ${u.stars}`,
        backBtn()
      );
    }

    // BALANCE
    if (data === 'balance') {
      return editCurrentCard(
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

      return editCurrentCard(
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

      return editCurrentCard(
        id,
        mid,
        `${link}\n👥 ${u.refs}`,
        backBtn()
      );
    }

    // WITHDRAW MENU
    if (data === 'withdraw') {
      return editCurrentCard(
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
        return editCurrentCard(id, mid, t.noMoney, backBtn());
      }

      u.stars -= amount;
      await saveUser(id, u);

      const reqId = await redis.incr('req_id');
      const { date, time } = formatDateTime();

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

      return editCurrentCard(
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
        return editCurrentCard(id, mid, t.myEmpty, backBtn());
      }

      let text = '';
      for (const r of list) {
        const status = r.status === 'pending' ? t.requestPending : String(r.status || '');
        text += `#${r.id} - ${r.amount}⭐ - ${status}\n`;
      }

      return editCurrentCard(id, mid, text.trim(), backBtn());
    }

    // LEADERBOARD
    if (data === 'top') {
      const top = await redis.zrange('leaderboard', 0, 9, { rev: true });

      if (!top || !top.length) {
        return editCurrentCard(id, mid, t.topEmpty, backBtn());
      }

      let text = `${t.top}\n\n`;

      for (let i = 0; i < top.length; i++) {
        const uid = top[i];
        const user = await getUser(uid);

        let name = 'user';
        if (user) {
          if (user.username && user.username !== 'user') {
            name = `@${user.username}`;
          } else if (user.first_name) {
            name = user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name;
          }
        }

        text += `${i + 1}. ${name} - ⭐ ${user?.stars || 0}\n`;
      }

      return editCurrentCard(id, mid, text.trim(), backBtn());
    }

    // LANG MENU
    if (data === 'lang') {
      return editCurrentCard(id, mid, '🌍', {
        inline_keyboard: langKeyboard().inline_keyboard,
      });
    }

    if (data.startsWith('lang_')) {
      u.lang = data.split('_')[1] || 'tr';
      await saveUser(id, u);

      return sendMenuCard(id, u);
    }

    // MENU
    if (data === 'menu') {
      return editCurrentCard(
        id,
        mid,
        texts[u.lang]?.menu || texts.tr.menu,
        {
          inline_keyboard: menuKeyboard(u).inline_keyboard,
        }
      );
    }
  } catch (err) {
    console.error('CALLBACK ERROR:', err);
  }
});

// SERVER
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log('Server running ' + PORT);
});
