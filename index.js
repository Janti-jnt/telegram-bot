const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// BURASI ÖNEMLİ: Render'a eklediğimiz değişkenleri çekiyoruz
const token = process.env.BOT_TOKEN; 
const url = "https://telegram-bot-71f6.onrender.com"; // Render'daki linkin tam olarak bu

const bot = new TelegramBot(token);
const app = express();

app.use(express.json());

// Telegram webhook ayarı
bot.setWebHook(`${url}/bot${token}`);

let users = {};

function getMenu(u) {
  return {
    text: `🎮 MENU\n\n⭐ Stars: ${u.stars}\n🎮 Plays: ${u.tries}`,
    reply_markup: {
      inline_keyboard:,
      ]
    }
  };
}

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users[chatId] = { stars: 20, tries: 5 };
  const menu = getMenu(users[chatId]);
  bot.sendMessage(chatId, menu.text, { reply_markup: menu.reply_markup });
});

bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    await bot.answerCallbackQuery(query.id);
    let u = users[chatId];
    if (!u) return;

    if (data === "play") {
      if (u.tries <= 0) return;
      u.tries--;
      let rand = Math.random();
      let text = "";
      if (rand < 0.55) text = "😢 Lost!";
      else if (rand < 0.85) {
        let r = Math.floor(Math.random() * 5) + 1;
        u.stars += r;
        text = `🎉 ${r}⭐ won`;
      } else {
        u.stars += 50;
        text = "💎 JACKPOT 50⭐";
      }
      bot.editMessageText(`${text}\n\n⭐ ${u.stars}\n🎮 ${u.tries}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: { inline_keyboard:] }
      });
    }

    if (data === "menu") {
      const menu = getMenu(u);
      bot.editMessageText(menu.text, {
        chat_id: chatId, message_id: messageId, reply_markup: menu.reply_markup
      });
    }
  } catch (e) { console.log(e); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running...");
});
