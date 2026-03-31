const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Redis } = require('@upstash/redis');

const token = process.env.BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const bot = new TelegramBot(token);
const app = express();
app.use(express.json());

// kullanıcı
async function getUser(id){
  return await redis.get(`user:${id}`);
}

async function saveUser(id,data){
  await redis.set(`user:${id}`, data);
}

// menu
function menu(u){
  return {
    text: `🎰\n\n⭐ ${u.stars}`,
    opts: {
      reply_markup:{
        inline_keyboard:[
          [{text:"🎮 Oyna",callback_data:"play"}],
          [{text:"⭐ Bakiye",callback_data:"balance"}],
          [{text:"💰 Yükle",callback_data:"buy"}]
        ]
      }
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

// START (TEK MESAJ)
bot.onText(/\/start/, async (msg)=>{
  const id = msg.chat.id;

  let u = await getUser(id);
  if(!u){
    u = {stars:0};
    await saveUser(id,u);
  }

  const m = menu(u);

  bot.sendMessage(id, m.text, m.opts);
});

// BUTTONS
bot.on("callback_query", async (q)=>{
  try{
    const id = q.message.chat.id;
    const mid = q.message.message_id;
    const data = q.data;

    await bot.answerCallbackQuery(q.id);

    let u = await getUser(id);
    if(!u) return;

    let text = "";

    if(data==="play"){
      if(u.stars <= 0){
        text = "❌ Yıldız yok";
      }else{
        u.stars--;

        if(Math.random() < 0.6){
          text = "😢 Kaybettin";
        }else{
          let win = Math.floor(Math.random()*5)+1;
          u.stars += win;
          text = `🎉 +${win}⭐`;
        }

        await saveUser(id,u);
      }
    }

    if(data==="buy"){
      u.stars += 10;
      await saveUser(id,u);
      text = "💰 +10⭐";
    }

    if(data==="balance"){
      text = `⭐ ${u.stars}`;
    }

    const m = menu(u);

    return bot.editMessageText(
      `${text}\n\n${m.text}`,
      {
        chat_id:id,
        message_id:mid,
        reply_markup:m.opts.reply_markup
      }
    );

  }catch(e){
    console.log(e);
  }
});
