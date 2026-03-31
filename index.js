const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const Redis = require('ioredis');

const token = process.env.BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL;

// 🔥 REDIS BAĞLANTI
const redis = new Redis(process.env.REDIS_URL);

const bot = new TelegramBot(token);
const app = express();
app.use(express.json());

bot.on("error", console.log);
bot.on("webhook_error", console.log);

// kullanıcı çek
async function getUser(id){
  let data = await redis.get(`user:${id}`);
  return data ? JSON.parse(data) : null;
}

// kullanıcı kaydet
async function saveUser(id, data){
  await redis.set(`user:${id}`, JSON.stringify(data));
}

// TEXT
const texts = {
  tr: {
    play: "🎮 Oyna",
    balance: "⭐ Bakiye",
    buy: "💰 Yükle",
    lang: "🌍 Dil",
    spinning: "🎰 Çark dönüyor...",
    win: (x)=>`🎉 +${x}⭐ Kazandın!`,
    lose: "😢 Kaybettin",
    chooseLang: "Dil seç:",
    noMoney: "❌ Yetersiz yıldız",
    balanceText: (u)=>`⭐ ${u.stars}\n🎮 ${u.tries}`
  }
};

// MENU
function menu(u){
  const t = texts[u.lang];
  return {
    text: "🎰",
    reply_markup:{
      inline_keyboard:[
        [{text:t.play,callback_data:"play"}],
        [
          {text:t.balance,callback_data:"balance"},
          {text:t.buy,callback_data:"buy"}
        ],
        [{text:t.lang,callback_data:"change_lang"}]
      ]
    }
  };
}

// webhook
app.post(`/bot${token}`, (req,res)=>{
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req,res)=>res.send("ok"));

app.listen(process.env.PORT || 3000);

setTimeout(()=>{
  bot.setWebHook(`${url}/bot${token}`);
},1500);

// START
bot.onText(/\/start/, async (msg)=>{
  const id = msg.chat.id;

  let u = await getUser(id);

  if(!u){
    u = {stars:0,tries:10,lang:"tr"};
    await saveUser(id,u);
  }

  const m = menu(u);
  bot.sendMessage(id,m.text,{reply_markup:m.reply_markup});
});

// BUTTONS
bot.on("callback_query", async (q)=>{
  const id = q.message.chat.id;
  const mid = q.message.message_id;
  const data = q.data;

  await bot.answerCallbackQuery(q.id);

  let u = await getUser(id);
  if(!u) return;

  const t = texts[u.lang];

  if(data==="play"){
    if(u.stars <= 0){
      return bot.editMessageText(t.noMoney,{
        chat_id:id,
        message_id:mid
      });
    }

    u.stars--;

    await bot.editMessageText(t.spinning,{
      chat_id:id,
      message_id:mid
    });

    await new Promise(r=>setTimeout(r,1000));

    if(Math.random()<0.5){
      u.stars += 3;
      text = t.win(3);
    }else{
      text = t.lose;
    }

    await saveUser(id,u);

    return bot.editMessageText(
      `${text}\n\n⭐ ${u.stars}`,
      { chat_id:id, message_id:mid }
    );
  }

  if(data==="buy"){
    u.stars += 10;
    await saveUser(id,u);

    return bot.editMessageText(
      `⭐ ${u.stars}`,
      { chat_id:id, message_id:mid }
    );
  }

  if(data==="balance"){
    return bot.editMessageText(
      t.balanceText(u),
      { chat_id:id, message_id:mid }
    );
  }
});
