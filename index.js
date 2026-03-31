const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Redis } = require('@upstash/redis');

const token = process.env.BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL;

// Redis (REST)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const bot = new TelegramBot(token);
const app = express();
app.use(express.json());

// kullanıcı al
async function getUser(id){
  return await redis.get(`user:${id}`);
}

// kullanıcı kaydet
async function saveUser(id, data){
  await redis.set(`user:${id}`, data);
}

// TEXT
const texts = {
  tr: {
    play: "🎮 Oyna",
    balance: "⭐ Bakiye",
    buy: "💰 Yükle",
    spinning: "🎰 Çark dönüyor...",
    win: (x)=>`🎉 +${x}⭐ Kazandın!`,
    lose: "😢 Kaybettin",
    noMoney: "❌ Yetersiz yıldız",
    balanceText: (u)=>`⭐ ${u.stars}`
  }
};

// menu
function menu(u){
  const t = texts.tr;
  return {
    text: "🎰",
    reply_markup:{
      inline_keyboard:[
        [{text:t.play,callback_data:"play"}],
        [
          {text:t.balance,callback_data:"balance"},
          {text:t.buy,callback_data:"buy"}
        ]
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
    u = {stars:0};
    await saveUser(id,u);
  }

  const m = menu(u);
  bot.sendMessage(id, m.text, {reply_markup:m.reply_markup});
});

// BUTTONS
bot.on("callback_query", async (q)=>{
  const id = q.message.chat.id;
  const mid = q.message.message_id;
  const data = q.data;

  await bot.answerCallbackQuery(q.id);

  let u = await getUser(id);
  if(!u) return;

  const t = texts.tr;

  // oyun
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

    let text = "";

    if(Math.random() < 0.6){
      text = t.lose;
    }else{
      let win = Math.floor(Math.random()*5)+1;
      u.stars += win;
      text = t.win(win);
    }

    await saveUser(id,u);

    return bot.editMessageText(
      `${text}\n\n⭐ ${u.stars}`,
      { chat_id:id, message_id:mid }
    );
  }

  // yükleme
  if(data==="buy"){
    u.stars += 10;
    await saveUser(id,u);

    return bot.editMessageText(
      `⭐ ${u.stars}`,
      { chat_id:id, message_id:mid }
    );
  }

  // bakiye
  if(data==="balance"){
    return bot.editMessageText(
      t.balanceText(u),
      { chat_id:id, message_id:mid }
    );
  }
});
