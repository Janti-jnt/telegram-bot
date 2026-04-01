const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Redis } = require('@upstash/redis');

const bot = new TelegramBot(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());

const ADMIN_ID = process.env.ADMIN_ID;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// USER
async function getUser(id){
  let u = await redis.get(`user:${id}`);
  if(!u) return null;

  if(typeof u.refs !== "number") u.refs = 0;
  if(typeof u.stars !== "number") u.stars = 0;
  if(typeof u.waiting !== "boolean") u.waiting = false;
  if(!u.lang) u.lang = null;

  return u;
}

async function saveUser(id,data){
  await redis.set(`user:${id}`, data);
}

// TEXTS (KISA TUTTUM AMA TAM ÇALIŞIR)
const texts = {
  tr: {
    menu:"🎰 Menü",
    withdraw:"💸 Çek",
    my:"📄 Taleplerim",
    done:"✅ Onaylandı",
  },
  en: {
    menu:"🎰 Menu",
    withdraw:"💸 Withdraw",
    my:"📄 My requests",
    done:"✅ Approved",
  },
  ru: {
    menu:"🎰 Меню",
    withdraw:"💸 Вывод",
    my:"📄 Мои заявки",
    done:"✅ Одобрено",
  }
};

// MENU
function menu(u){
  const t = texts[u.lang];
  return {
    text:t.menu,
    reply_markup:{
      inline_keyboard:[
        [{text:"💸",callback_data:"withdraw"}],
        [{text:t.my,callback_data:"my"}]
      ]
    }
  };
}

// WITHDRAW OPTIONS
function withdrawMenu(){
  const amounts = [15,25,50,100,350,500,650,1000];
  return {
    reply_markup:{
      inline_keyboard: amounts.map(a=>[{text:`${a}⭐`,callback_data:`w_${a}`}])
    }
  };
}

// START
bot.onText(/\/start/, async (msg)=>{
  const id = msg.chat.id;

  let u = await getUser(id);
  if(!u){
    u = {stars:0,refs:0,lang:"ru"};
    await saveUser(id,u);
  }

  const m = menu(u);
  bot.sendMessage(id,m.text,{reply_markup:m.reply_markup});
});

// BUTTONS
bot.on("callback_query", async (q)=>{
  const id = q.message.chat.id;
  const data = q.data;
  const mid = q.message.message_id;

  let u = await getUser(id);
  if(!u) return;

  const t = texts[u.lang];

  await bot.answerCallbackQuery(q.id);

  // withdraw menu
  if(data==="withdraw"){
    return bot.editMessageText("💸",{
      chat_id:id,
      message_id:mid,
      reply_markup:withdrawMenu().reply_markup
    });
  }

  // create request
  if(data.startsWith("w_")){
    const amount = parseInt(data.split("_")[1]);

    if(u.stars < amount){
      return bot.answerCallbackQuery(q.id,{text:"❌"});
    }

    u.stars -= amount;
    await saveUser(id,u);

    let count = await redis.incr("withdraw_id");

    const now = new Date();
    const time = now.toLocaleTimeString();
    const date = now.toLocaleDateString();

    const req = {
      id:count,
      amount,
      time,
      date,
      status:"done"
    };

    let list = await redis.get(`req_${id}`) || [];
    list.push(req);
    await redis.set(`req_${id}`,list);

    // USER SCREEN
    await bot.editMessageText(
`Заявка #${count}
${amount}⭐
Число: ${date} Время: ${time}
${t.done}`,
      {
        chat_id:id,
        message_id:mid,
        reply_markup:{
          inline_keyboard:[
            [{text:"🔙",callback_data:"menu"}]
          ]
        }
      }
    );

    // ADMIN MESSAGE
    bot.sendMessage(ADMIN_ID,
`🔥 NEW WITHDRAW

ID: #${count}
User: @${q.from.username || "no_username"}
Amount: ${amount}⭐
Time: ${date} ${time}`
    );

  }

  // MY REQUESTS
  if(data==="my"){
    let list = await redis.get(`req_${id}`) || [];

    if(list.length === 0){
      return bot.editMessageText("❌",{
        chat_id:id,
        message_id:mid
      });
    }

    let text = list.map(r=>
`#${r.id} • ${r.amount}⭐ • ${r.date} ${r.time}`
    ).join("\n");

    return bot.editMessageText(text,{
      chat_id:id,
      message_id:mid,
      reply_markup:{
        inline_keyboard:[
          [{text:"🔙",callback_data:"menu"}]
        ]
      }
    });
  }

  if(data==="menu"){
    const m = menu(u);
    return bot.editMessageText(m.text,{
      chat_id:id,
      message_id:mid,
      reply_markup:m.reply_markup
    });
  }
});

// WEBHOOK
app.post(`/bot${process.env.BOT_TOKEN}`, (req,res)=>{
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req,res)=>res.send("ok"));
app.listen(process.env.PORT || 3000);
