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

const DEFAULT_MENU_PHOTO_URL = 'https://i.ibb.co/JSLjw7m/B8-D80-FDD-AB82-43-A0-8272-9461-CB1-D932-A.png';
const MENU_PHOTO_URL = process.env.MENU_PHOTO_URL || DEFAULT_MENU_PHOTO_URL;

const DEFAULT_CHAT_URL = 'https://t.me/Jantistar_chat';
const CHAT_URL = process.env.CHAT_URL || DEFAULT_CHAT_URL;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SPIN_COST = 50;
const TASK_REWARD = 0.45;
const TASK_WAIT_MS = 11000;

// ======================================================
// Rewards
// ======================================================
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ======================================================
// Tasks
// ======================================================
const TASKS = [
  { id: 1, name: 'rahmetbrobot', url: 'https://t.me/rahmetbrobot?start=_tgr_Qk_L4481NTMy' },
  { id: 2, name: 'onelinkgo_bot', url: 'https://t.me/onelinkgo_bot?start=_tgr_tEBbQ1lmNWIy' },
  { id: 3, name: 'bababoba2bot', url: 'https://t.me/bababoba2bot?start=_tgr_BIVFp9BjYzhi' },
  { id: 4, name: 'peretopzvbot', url: 'https://t.me/peretopzvbot?start=_tgr_lo4LoWthZWIy' },
  { id: 5, name: 'lastdayzetbot', url: 'https://t.me/lastdayzetbot?start=_tgr_2D2rGHZkYzBi' },
  { id: 6, name: 'StarsSwapAutoBot', url: 'https://t.me/StarsSwapAutoBot?start=_tgr_Yfyia040MGVi' },
  { id: 7, name: 'SugarGenBox_bot', url: 'https://t.me/SugarGenBox_bot?start=_tgr_aXqKf55kYzUy' },
  { id: 8, name: 'ImarketTostar_bot', url: 'https://t.me/ImarketTostar_bot?start=_tgr_AjkkQzsxOWMy' },
  { id: 9, name: 'BuyVPN_Global_bot', url: 'https://t.me/BuyVPN_Global_bot?start=_tgr_yCNoJnQzOTMy' },
];

function taskState(u, taskId) {
  if (!u.task_states) return 'pending';
  return u.task_states[String(taskId)] || 'pending';
}

function taskIndexById(taskId) {
  return TASKS.findIndex((t) => t.id === taskId);
}

function getTaskIndex(u) {
  const idx = Number.isInteger(u.task_index) ? u.task_index : 0;
  return idx < 0 ? 0 : idx;
}

function currentTask(u) {
  const idx = getTaskIndex(u);

  for (let i = idx; i < TASKS.length; i++) {
    const task = TASKS[i];
    if (taskState(u, task.id) === 'pending') return task;
  }

  for (let i = 0; i < TASKS.length; i++) {
    const task = TASKS[i];
    if (taskState(u, task.id) === 'skipped') return task;
  }

  return null;
}

function isTasksFinished(u) {
  return TASKS.every((task) => taskState(u, task.id) === 'done');
}

function markTaskSkipped(u, task) {
  if (!u.task_states) u.task_states = {};
  const key = String(task.id);

  if (taskState(u, task.id) !== 'done') {
    u.task_states[key] = 'skipped';
  }

  return u;
}

function markTaskDone(u, task) {
  if (!u.task_states) u.task_states = {};
  const key = String(task.id);
  u.task_states[key] = 'done';
  return u;
}

function advanceTaskCursor(u, task) {
  const idx = taskIndexById(task.id);

  if (idx >= 0) {
    u.task_index = idx + 1;
  } else {
    u.task_index = (Number.isInteger(u.task_index) ? u.task_index : 0) + 1;
  }

  u.task_started_at = 0;
  u.task_active_task_id = 0;
  return u;
}

function getTaskStartTime(u, taskId) {
  if (!u.task_started_at_by_id || typeof u.task_started_at_by_id !== 'object') {
    u.task_started_at_by_id = {};
  }
  return Number(u.task_started_at_by_id[String(taskId)] || 0);
}

function setTaskStartTime(u, taskId, ts = Date.now()) {
  if (!u.task_started_at_by_id || typeof u.task_started_at_by_id !== 'object') {
    u.task_started_at_by_id = {};
  }
  u.task_started_at_by_id[String(taskId)] = ts;
  return u;
}

function clearTaskStartTime(u, taskId) {
  if (!u.task_started_at_by_id || typeof u.task_started_at_by_id !== 'object') {
    u.task_started_at_by_id = {};
  }
  delete u.task_started_at_by_id[String(taskId)];
  return u;
}

function resetTaskProgress(u) {
  u.task_index = 0;
  u.task_started_at = 0;
  u.task_active_task_id = 0;
  u.task_states = {};
  u.task_started_at_by_id = {};
  return u;
}

// ======================================================
// Keyboard helpers
// ======================================================
function backKeyboard() {
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
        { text: t.tasks, callback_data: 'tasks' },
      ],
      [
        { text: t.ref, callback_data: 'ref' },
        { text: t.chat, url: CHAT_URL },
        { text: t.withdraw, callback_data: 'withdraw' },
      ],
      [
        { text: t.my, callback_data: 'my' },
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
      [{ text: '🔙', callback_data: 'menu' }],
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

function taskKeyboardForUser(u) {
  const t = texts[u.lang] || texts.tr;
  const task = currentTask(u);

  if (!task) {
    return {
      inline_keyboard: [[{ text: t.taskBack, callback_data: 'menu' }]],
    };
  }

  return {
    inline_keyboard: [
      [{ text: t.taskOpen, url: task.url }],
      [{ text: t.taskCheck, callback_data: 'task_check' }],
      [{ text: t.taskSkip, callback_data: 'task_skip' }],
      [{ text: t.taskBack, callback_data: 'menu' }],
    ],
  };
}

// ======================================================
// Date / name helpers
// ======================================================
function nowDateTime() {
  const now = new Date();
  return {
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
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

// ======================================================
// Safe message helpers
// ======================================================
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

async function sendTextCard(chatId, text, keyboard) {
  return bot.sendMessage(chatId, text, {
    reply_markup: keyboard,
  });
}

async function replaceWithMenu(chatId, messageId, u, prefix = '') {
  await safeDelete(chatId, messageId);
  return sendMenuCard(chatId, u, prefix);
}

async function replaceWithText(chatId, messageId, text, keyboard) {
  await safeDelete(chatId, messageId);
  return sendTextCard(chatId, text, keyboard);
}

// ======================================================
// User storage
// ======================================================
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
  if (!u.referred_by) u.referred_by = null;
  if (typeof u.ref_rewarded !== 'boolean') u.ref_rewarded = false;
  if (!Number.isInteger(u.task_index)) u.task_index = 0;
  if (!Number.isFinite(u.task_started_at)) u.task_started_at = 0;
  if (typeof u.task_states !== 'object' || u.task_states === null) u.task_states = {};
  if (!Number.isInteger(u.task_active_task_id)) u.task_active_task_id = 0;
  if (!u.task_started_at_by_id || typeof u.task_started_at_by_id !== 'object') {
    u.task_started_at_by_id = {};
  }

  return u;
}

async function saveUser(id, data) {
  await redis.set(`user:${id}`, data);

  await redis.zadd('leaderboard', {
    score: data.stars,
    member: id.toString(),
  });
}

// ======================================================
// Request storage
// ======================================================
async function getRequests(id) {
  const r = await redis.get(`req_${id}`);
  return r || [];
}

async function saveRequest(id, data) {
  const list = (await redis.get(`req_${id}`)) || [];
  list.push(data);
  await redis.set(`req_${id}`, list);
}

// ======================================================
// Texts
// ======================================================
const texts = {
  tr: {
    menu: '🎰 Menü',
    play: '🎮 Oyna (50⭐)',
    balance: '⭐ Bakiye',
    ref: '👥 Davet',
    chat: '💬 Chat',
    withdraw: '💸 Çek',
    my: '📄 Taleplerim',
    top: '🏆 Liderler',
    tasks: '🧩 Görevler',
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
    refNote: '👥 Her arkadaş için +1.5⭐ (kişi başı sadece 1 kez)',

    taskTitle: 'Görev',
    taskOpen: '🚀 Botu Aç',
    taskCheck: '✅ Kontrol Et',
    taskSkip: '⏭ Görevi Geç',
    taskBack: '🔙 Geri',
    taskReward: 'Ödül',
    taskInstruction1: 'Bota girin /start yapın',
    taskInstruction2: '5 saniye sonra geri dönün',
    taskInstruction3: 'Kontrol Et tuşuna basın',
    taskComplete: '🎉 Görev tamamlandı',
    taskSkipped: '⏭ Görev geçildi',
    taskCount: (i, total) => `Görev ${i}/${total}`,
    taskIntro: 'Aşağıdaki botlardan birini açın, /start yapın ve sonra kontrol edin.',
    taskNoMore: 'Görev listesi sona erdi',
    taskFinished: '✅ Tüm görevler tamamlandı',
    taskNoTask: '❌ Görev kalmadı',
    taskWait: '⏳ Biraz daha bekle',
  },

  en: {
    menu: '🎰 Menu',
    play: '🎮 Play (50⭐)',
    balance: '⭐ Balance',
    ref: '👥 Invite',
    chat: '💬 Chat',
    withdraw: '💸 Withdraw',
    my: '📄 My requests',
    top: '🏆 Leaderboard',
    tasks: '🧩 Tasks',
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
    refNote: '👥 +1.5⭐ for each friend (only once per user)',

    taskTitle: 'Task',
    taskOpen: '🚀 Open Bot',
    taskCheck: '✅ Check',
    taskSkip: '⏭ Skip',
    taskBack: '🔙 Back',
    taskReward: 'Reward',
    taskInstruction1: 'Enter the bot and /start',
    taskInstruction2: 'Come back after 5 seconds',
    taskInstruction3: 'Press Check',
    taskComplete: '🎉 Task completed',
    taskSkipped: '⏭ Task skipped',
    taskCount: (i, total) => `Task ${i}/${total}`,
    taskIntro: 'Open one of the bots below, send /start, then check.',
    taskNoMore: 'No more tasks left',
    taskFinished: '✅ All tasks completed',
    taskNoTask: '❌ No task left',
    taskWait: '⏳ Wait a little longer',
  },

  ru: {
    menu: '🎰 Меню',
    play: '🎮 Играть (50⭐)',
    balance: '⭐ Баланс',
    ref: '👥 Пригласить',
    chat: '💬 Чат',
    withdraw: '💸 Вывод',
    my: '📄 Мои заявки',
    top: '🏆 Топ',
    tasks: '🧩 Задания',
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
    refNote: '👥 +1.5⭐ за каждого друга (только 1 раз на пользователя)',

    taskTitle: 'Задание',
    taskOpen: '🚀 Открыть бот',
    taskCheck: '✅ Проверить',
    taskSkip: '⏭ Пропустить',
    taskBack: '🔙 Назад',
    taskReward: 'Награда',
    taskInstruction1: 'Зайди в бота и /start',
    taskInstruction2: 'Через 5 секунд вернись',
    taskInstruction3: 'Нажми Check',
    taskComplete: '🎉 Задание выполнено',
    taskSkipped: '⏭ Задание пропущено',
    taskCount: (i, total) => `Задание ${i}/${total}`,
    taskIntro: 'Открой одного из ботов ниже, отправь /start, потом проверь.',
    taskNoMore: 'Задания закончились',
    taskFinished: '✅ Все задания выполнены',
    taskNoTask: '❌ Заданий не осталось',
    taskWait: '⏳ Подожди ещё немного',
  },
};

function taskScreenText(u) {
  const t = texts[u.lang] || texts.tr;
  const task = currentTask(u);

  if (!task) {
    const lines = [
      `🧩 ${t.taskTitle}`,
      '',
      t.taskFinished,
      '',
      t.taskNoTask,
      '',
      t.taskNoMore,
    ];
    return lines.join('\n');
  }

  const idx = TASKS.findIndex((x) => x.id === task.id) + 1;
  const total = TASKS.length;

  const lines = [
    `🧩 ${t.taskTitle}`,
    '',
    t.taskCount(idx, total),
    `Bot: ${task.name}`,
    `${t.taskReward}: ${TASK_REWARD}⭐`,
    '',
    t.taskIntro,
    `1) ${t.taskInstruction1}`,
    `2) ${t.taskInstruction2}`,
    `3) ${t.taskInstruction3}`,
  ];

  return lines.join('\n');
}

function taskKeyboardForUser(u) {
  const t = texts[u.lang] || texts.tr;
  const task = currentTask(u);

  if (!task) {
    return {
      inline_keyboard: [[{ text: t.taskBack, callback_data: 'menu' }]],
    };
  }

  return {
    inline_keyboard: [
      [{ text: t.taskOpen, url: task.url }],
      [{ text: t.taskCheck, callback_data: 'task_check' }],
      [{ text: t.taskSkip, callback_data: 'task_skip' }],
      [{ text: t.taskBack, callback_data: 'menu' }],
    ],
  };
}

async function sendTaskScreen(chatId, u, prefix = '') {
  const task = currentTask(u);

  if (!task) {
    return sendTextCard(chatId, `${prefix}${taskScreenText(u)}`, backKeyboard());
  }

  setTaskStartTime(u, task.id, Date.now());
  u.task_active_task_id = task.id;
  await saveUser(chatId, u);

  return sendTextCard(chatId, `${prefix}${taskScreenText(u)}`, taskKeyboardForUser(u));
}

async function clearActiveTaskIfAny(u) {
  const task = currentTask(u);
  if (task) {
    clearTaskStartTime(u, task.id);
  }
  u.task_active_task_id = 0;
  return u;
}

// ======================================================
// /start
// ======================================================
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  try {
    const id = msg.chat.id;
    const ref = match && match[1] ? String(match[1]) : '';
    const username = msg.from?.username || 'user';
    const firstName = msg.from?.first_name || '';
    const lastName = msg.from?.last_name || '';

    let u = await getUser(id);
    const isNewUser = !u;

    if (!u) {
      u = {
        stars: 100,
        refs: 0,
        lang: 'tr',
        username,
        first_name: firstName,
        last_name: lastName,
        waiting: false,
        referred_by: null,
        ref_rewarded: false,
        task_index: 0,
        task_started_at: 0,
        task_states: {},
        task_active_task_id: 0,
        task_started_at_by_id: {},
      };

      await saveUser(id, u);
    } else {
      u.username = username;
      u.first_name = firstName;
      u.last_name = lastName;
      if (!u.lang) u.lang = 'tr';
      if (!u.referred_by) u.referred_by = null;
      if (typeof u.ref_rewarded !== 'boolean') u.ref_rewarded = false;
      if (!Number.isInteger(u.task_index)) u.task_index = 0;
      if (!Number.isFinite(u.task_started_at)) u.task_started_at = 0;
      if (typeof u.task_states !== 'object' || u.task_states === null) u.task_states = {};
      if (!Number.isInteger(u.task_active_task_id)) u.task_active_task_id = 0;
      if (!u.task_started_at_by_id || typeof u.task_started_at_by_id !== 'object') {
        u.task_started_at_by_id = {};
      }
      await saveUser(id, u);
    }

    if (isNewUser && ref && ref !== String(id)) {
      const refUser = await getUser(ref);
      if (refUser) {
        refUser.stars += 1.5;
        refUser.refs += 1;
        await saveUser(ref, refUser);

        u.referred_by = String(ref);
        u.ref_rewarded = true;
        await saveUser(id, u);
      }
    }

    return sendMenuCard(id, u);
  } catch (err) {
    console.error('START ERROR:', err);
  }
});

// ======================================================
// Reset tasks for testing
// ======================================================
bot.onText(/^\/reset_tasks$/i, async (msg) => {
  try {
    const id = msg.chat.id;
    let u = await getUser(id);
    if (!u) return;

    resetTaskProgress(u);
    await saveUser(id, u);

    return sendMenuCard(id, u, '✅ Görevler sıfırlandı\n\n');
  } catch (err) {
    console.error('RESET TASKS ERROR:', err);
  }
});

// ======================================================
// Message handler
// ======================================================
bot.on('message', async (msg) => {
  try {
    const id = msg.chat.id;
    let u = await getUser(id);
    if (!u) return;

    const text = (msg.text || '').trim();
    if (!u.waiting) return;
    if (text.startsWith('/')) return;
    if (!/^\d+$/.test(text)) return;

    const n = parseInt(text, 10);

    if (n >= 25 && n <= 10000) {
      u.stars += n;
      u.waiting = false;
      await saveUser(id, u);

      return sendMenuCard(id, u, `✅ +${n}⭐\n\n`);
    }
  } catch (err) {
    console.error('MESSAGE ERROR:', err);
  }
});

// ======================================================
// Callback handler
// ======================================================
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

    if (data === 'tasks') {
      await clearActiveTaskIfAny(u);
      await saveUser(id, u);
      return replaceWithText(id, mid, taskScreenText(u), taskKeyboardForUser(u));
    }

    if (data === 'task_check') {
      const task = currentTask(u);
      if (!task) {
        return replaceWithText(id, mid, taskScreenText(u), backKeyboard());
      }

      const activeId = Number.isInteger(u.task_active_task_id) ? u.task_active_task_id : 0;
      const startedAt = getTaskStartTime(u, task.id);

      if (!startedAt || activeId !== task.id) {
        setTaskStartTime(u, task.id, Date.now());
        u.task_active_task_id = task.id;
        await saveUser(id, u);

        return bot.answerCallbackQuery(q.id, {
          text: t.taskWait,
          show_alert: true,
        });
      }

      const elapsed = Date.now() - startedAt;

      if (elapsed < TASK_WAIT_MS) {
        return bot.answerCallbackQuery(q.id, {
          text: t.taskWait,
          show_alert: true,
        });
      }

      u.stars += TASK_REWARD;
      markTaskDone(u, task);
      clearTaskStartTime(u, task.id);
      advanceTaskCursor(u, task);
      await saveUser(id, u);

      await safeDelete(id, mid);

      if (isTasksFinished(u)) {
        return sendTextCard(
          id,
          `${t.taskComplete}\n+${TASK_REWARD}⭐\n\n${taskScreenText(u)}`,
          backKeyboard()
        );
      }

      return sendTaskScreen(id, u, `${t.taskComplete}\n+${TASK_REWARD}⭐\n\n`);
    }

    if (data === 'task_skip') {
      const task = currentTask(u);
      if (!task) {
        return replaceWithText(id, mid, taskScreenText(u), backKeyboard());
      }

      markTaskSkipped(u, task);
      clearTaskStartTime(u, task.id);
      advanceTaskCursor(u, task);
      await saveUser(id, u);

      await safeDelete(id, mid);

      if (isTasksFinished(u)) {
        return sendTextCard(
          id,
          `${t.taskSkipped}\n\n${taskScreenText(u)}`,
          backKeyboard()
        );
      }

      return sendTaskScreen(id, u, `${t.taskSkipped}\n\n`);
    }

    if (data === 'play') {
      if (u.stars < SPIN_COST) {
        return replaceWithText(id, mid, t.noMoney, backKeyboard());
      }

      u.stars -= SPIN_COST;
      await saveUser(id, u);

      await safeDelete(id, mid);
      const spinMsg = await sendTextCard(id, t.spinning, null);

      await delay(1000);

      let win = spin();
      if (win > 0) u.stars += win;

      await saveUser(id, u);

      try {
        await safeDelete(id, spinMsg.message_id);
      } catch (e) {}

      return sendTextCard(
        id,
        win > 0 ? `${t.win(win)}\n⭐ ${u.stars}` : `${t.lose}\n⭐ ${u.stars}`,
        backKeyboard()
      );
    }

    if (data === 'balance') {
      return replaceWithText(id, mid, `⭐ ${u.stars}\n👥 ${u.refs}`, backKeyboard());
    }

    if (data === 'ref') {
      const link = BOT_USERNAME
        ? `https://t.me/${BOT_USERNAME}?start=${id}`
        : `https://t.me/?start=${id}`;

      return replaceWithText(
        id,
        mid,
        `${link}\n${t.refNote}\n👥 ${u.refs}`,
        backKeyboard()
      );
    }

    if (data === 'withdraw') {
      return replaceWithText(id, mid, t.withdrawMenu, withdrawKeyboard());
    }

    if (data.startsWith('w_')) {
      const amount = parseInt(data.split('_')[1], 10);

      if (!amount || u.stars < amount) {
        return replaceWithText(id, mid, t.noMoney, backKeyboard());
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
        backKeyboard()
      );
    }

    if (data === 'my') {
      const list = await getRequests(id);

      if (!list.length) {
        return replaceWithText(id, mid, t.myEmpty, backKeyboard());
      }

      let text = '';
      for (const r of list) {
        const status = r.status === 'pending' ? t.requestPending : String(r.status || '');
        text += `#${r.id} - ${r.amount}⭐ - ${status}\n`;
      }

      return replaceWithText(id, mid, text.trim(), backKeyboard());
    }

    if (data === 'top') {
      const top = await redis.zrange('leaderboard', 0, 9, { rev: true });

      if (!top || !top.length) {
        return replaceWithText(id, mid, t.topEmpty, backKeyboard());
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

      return replaceWithText(id, mid, text.trim(), backKeyboard());
    }

    if (data === 'lang') {
      await safeDelete(id, mid);
      return sendTextCard(id, '🌍 Select language', langKeyboard());
    }

    if (data.startsWith('lang_')) {
      u.lang = data.split('_')[1] || 'tr';
      await saveUser(id, u);
      return replaceWithMenu(id, mid, u);
    }

    if (data === 'menu') {
      await clearActiveTaskIfAny(u);
      await saveUser(id, u);
      return replaceWithMenu(id, mid, u);
    }
  } catch (err) {
    console.error('CALLBACK ERROR:', err);
  }
});

// ======================================================
// Server
// ======================================================
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
