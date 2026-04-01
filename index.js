const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Redis } = require('@upstash/redis');

const bot = new TelegramBot(process.env.BOT_TOKEN);
const app = express();
app.use(express.json());

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// USER
async function getUser(id){
  return await redis.get(`user:${id}`);
}
async function saveUser(id,data){
  await redis.set(`user:${id}`, data);
}

// 🌍 TEXTS
const texts = {
  tr: {
    menu:"🎰 Menü",
    play:"🎮 Oyna",
    balance:"⭐ Bakiye",
    buy:"💰 Yükle",
    lang:"🌍 Dil",
    spinning:"🎰 Çark dönüyor...",
    lose:"😢 Kaybettin",
    win:(x)=>`🎉 +${x}⭐ Kazandın!`,
    ask:"💰 kaç yıldız yüklemek istiyorsun? (25-10000)",
    noMoney:"❌ Yetersiz bakiye"
  },
  en: {
    menu:"🎰 Menu",
    play:"🎮 Play",
    balance:"⭐ Balance",
    buy:"💰 Deposit",
    lang:"🌍 Language",
    spinning:"🎰 Spinning...",
    lose:"😢 Lost",
    win:(x)=>`🎉 +${x}⭐ Won!`,
    ask:"💰 enter amount (25-10000)",
    noMoney:"❌ Not enough balance"
  },
  ru: {
    menu:"🎰 Меню",
    play:"🎮 Играть",
    balance:"⭐ Баланс",
    buy:"💰 Пополнить",
    lang:"🌍 Язык",
    spinning:"🎰 Крутится...",
    lose:"😢 Проигрыш",
    win:(x)=>`🎉 +${x}⭐ выигрыш`,
    ask:"💰 сколько звезд добавить? (25-10000)",
    noMoney:"❌ Недостаточно средств"
  }
};

// MENU
function menu(u){
  const t = texts[u.lang];
  return {
    text:`${t.menu}`,
    reply_markup:{
      inline_keyboard:[
        [{text:t.play,callback_data:"play"}],
        [{text:t.balance,callback_data:"balance"}],
        [{text:t.buy,callback_data:"buy"}],
        [{text:t.lang,callback_data:"lang"}]
      ]
    }
  };
}

// LANG MENU
function langMenu(){
  return {
    reply_markup:{
      inline_keyboard:[
        [{text:"🇹🇷 TR",callback_data:"lang_tr"}],
        [{text:"🇬🇧 EN",callback_data:"lang_en"}],
        [{text:"🇷🇺 RU",callback_data:"lang_ru"}]
      ]
    }
  };
}

// WEBHOOK
app.post(`/bot${process.env.BOT_TOKEN}`, (req,res)=>{
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.get("/", (req,res)=>res.send("ok"));
app.listen(process.env.PORT || 3000);

// START
bot.onText(/\/start/, async (msg)=>{
  const id = msg.chat.id;

  let u = await getUser(id);
  if(!u){
    u = {stars:0,lang:null,waiting:false};
    await saveUser(id,u);
  }

  if(!u.lang){
    return bot.sendMessage(id,"🌍 Dil seç:",langMenu());
  }

  const m = menu(u);
  return bot.sendMessage(id, m.text, {reply_markup:m.reply_markup});
});

// CUSTOM YÜKLEME
bot.on("message", async (msg)=>{
  const id = msg.chat.id;

  let u = await getUser(id);
  if(!u || !u.waiting) return;

  let n = parseInt(msg.text);

  if(n >=25 && n<=10000){
    u.stars += n;
    u.waiting = false;
    await saveUser(id,u);

    const m = menu(u);
    return bot.sendMessage(id, `✅ +${n}⭐`, {
      reply_markup:m.reply_markup
    });
  }
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

    // LANG SELECT
    if(data.startsWith("lang_")){
      u.lang = data.split("_")[1] || "tr";
      await saveUser(id,u);

      const m = menu(u);
      return bot.editMessageText(m.text,{
        chat_id:id,
        message_id:mid,
        reply_markup:m.reply_markup
      });
    }

    const t = texts[u.lang];

    if(data==="lang"){
      return bot.editMessageText("🌍",{
        chat_id:id,
        message_id:mid,
        reply_markup:langMenu().reply_markup
      });
    }

    // 🎰 PLAY
    if(data==="play"){
      if(u.stars<=0){
        return bot.editMessageText(t.noMoney,{
          chat_id:id,
          message_id:mid,
          reply_markup:{
            inline_keyboard:[
              [{text:"🔙",callback_data:"menu"}]
            ]
          }
        });
      }

      u.stars--;

      await bot.editMessageText(t.spinning,{
        chat_id:id,
        message_id:mid
      });

      await new Promise(r=>setTimeout(r,1200));

      let text;
      if(Math.random()<0.6){
        text=t.lose;
      }else{
        let w=Math.floor(Math.random()*5)+1;
        u.stars+=w;
        text=t.win(w);
      }

      await saveUser(id,u);

      return bot.editMessageText(`${text}\n\n⭐ ${u.stars}`,{
        chat_id:id,
        message_id:mid,
        reply_markup:{
          inline_keyboard:[
            [{text:"🔙",callback_data:"menu"}]
          ]
        }
      });
    }

    // MENU
    if(data==="menu"){
      const m = menu(u);
      return bot.editMessageText(m.text,{
        chat_id:id,
        message_id:mid,
        reply_markup:m.reply_markup
      });
    }

    // BALANCE
    if(data==="balance"){
      return bot.editMessageText(`⭐ ${u.stars}`,{
        chat_id:id,
        message_id:mid,
        reply_markup:{
          inline_keyboard:[
            [{text:"🔙",callback_data:"menu"}]
          ]
        }
      });
    }

    // BUY
    if(data==="buy"){
      u.waiting = true;
      await saveUser(id,u);

      return bot.editMessageText(t.ask,{
        chat_id:id,
        message_id:mid
      });
    }

  }catch(e){
    console.log(e);
  }
});
