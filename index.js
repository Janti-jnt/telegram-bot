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

// TEXTS
const texts = {
  tr: {
    menu:"🎰 Menü",
    play:"🎮 Oyna",
    balance:"⭐ Bakiye",
    buy:"💰 Yükle",
    lang:"🌍 Dil",
    ref:"👥 Davet",
    spinning:"🎰 Çark dönüyor...",
    lose:"😢 Kaybettin",
    win:(x)=>`🎉 +${x}⭐ Kazandın!`,
    ask:"💰 kaç yıldız yüklemek istiyorsun? (25-10000)",
    noMoney:"❌ Yetersiz bakiye",
    refText:(u,id)=>`👥 Davet sayın: ${u.refs}\n\nLink:\nhttps://t.me/${process.env.BOT_USERNAME}?start=${id}`
  },
  en: {
    menu:"🎰 Menu",
    play:"🎮 Play",
    balance:"⭐ Balance",
    buy:"💰 Deposit",
    lang:"🌍 Language",
    ref:"👥 Invite",
    spinning:"🎰 Spinning...",
    lose:"😢 Lost",
    win:(x)=>`🎉 +${x}⭐ Won!`,
    ask:"enter amount (25-10000)",
    noMoney:"❌ Not enough balance",
    refText:(u,id)=>`👥 Referrals: ${u.refs}\n\nLink:\nhttps://t.me/${process.env.BOT_USERNAME}?start=${id}`
  },
  ru: {
    menu:"🎰 Меню",
    play:"🎮 Играть",
    balance:"⭐ Баланс",
    buy:"💰 Пополнить",
    lang:"🌍 Язык",
    ref:"👥 Пригласить",
    spinning:"🎰 Крутится...",
    lose:"😢 Проигрыш",
    win:(x)=>`🎉 +${x}⭐ выигрыш`,
    ask:"(25-10000)",
    noMoney:"❌ Недостаточно средств",
    refText:(u,id)=>`👥 Рефералы: ${u.refs}\n\nСсылка:\nhttps://t.me/${process.env.BOT_USERNAME}?start=${id}`
  }
};

// MENU
function menu(u){
  const t = texts[u.lang];
  return {
    text:t.menu,
    reply_markup:{
      inline_keyboard:[
        [{text:t.play,callback_data:"play"}],
        [{text:t.balance,callback_data:"balance"}],
        [{text:t.buy,callback_data:"buy"}],
        [{text:t.ref,callback_data:"ref"}],
        [{text:t.lang,callback_data:"lang"}]
      ]
    }
  };
}

// START + REF
bot.onText(/\/start(?: (.+))?/, async (msg, match)=>{
  const id = msg.chat.id;
  const ref = match[1]; // referral id

  let u = await getUser(id);

  // yeni kullanıcı
  if(!u){
    u = {stars:0,lang:null,waiting:false,refs:0};
    await saveUser(id,u);

    // 🎯 REFERAL
    if(ref && ref != id){
      let refUser = await getUser(ref);

      if(refUser){
        refUser.stars += 1.5;
        refUser.refs += 1;

        await saveUser(ref, refUser);
      }
    }
  }

  if(!u.lang){
    return bot.sendMessage(id,"🌍 Dil seç:",{
      reply_markup:{
        inline_keyboard:[
          [{text:"🇹🇷 TR",callback_data:"lang_tr"}],
          [{text:"🇬🇧 EN",callback_data:"lang_en"}],
          [{text:"🇷🇺 RU",callback_data:"lang_ru"}]
        ]
      }
    });
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

  if(data==="ref"){
    return bot.editMessageText(
      t.refText(u,id),
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
