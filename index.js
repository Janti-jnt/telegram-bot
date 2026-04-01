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

const SPIN_COST = 50;

// 🎯 REWARDS
const rewards = [
  {amount:5, chance:26},
  {amount:10, chance:14},
  {amount:35, chance:10},
  {amount:50, chance:7},
  {amount:100, chance:5},
  {amount:150, chance:3},
  {amount:500, chance:2},
  {amount:750, chance:1},
  {amount:850, chance:0.04},
  {amount:950, chance:0.02},
  {amount:1000, chance:0.01},
];

function spin(){
  let r = Math.random()*100;
  let sum = 0;
  for(let i of rewards){
    sum += i.chance;
    if(r <= sum) return i.amount;
  }
  return 0;
}

function backBtn(){
  return {inline_keyboard:[[{text:"🔙",callback_data:"menu"}]]};
}

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

  // ✅ UPSTASH DOĞRU leaderboard
  await redis.zadd("leaderboard", {
    score: data.stars,
    member: id.toString()
  });
}

// TEXTS
const texts = {
  tr:{
    menu:"🎰 Menü",
    play:"🎮 Oyna (50⭐)",
    balance:"⭐ Bakiye",
    buy:"💰 Yükle",
    ref:"👥 Davet",
    withdraw:"💸 Çek",
    my:"📄 Taleplerim",
    top:"🏆 Liderler",
    lang:"🌍 Dil",
    noMoney:"❌ Yetersiz bakiye",
    spinning:"🎰 Çark dönüyor...",
    lose:"😢 Kaybettin",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"💰 (25-10000)"
  },
  en:{
    menu:"🎰 Menu",
    play:"🎮 Play (50⭐)",
    balance:"⭐ Balance",
    buy:"💰 Deposit",
    ref:"👥 Invite",
    withdraw:"💸 Withdraw",
    my:"📄 Requests",
    top:"🏆 Leaderboard",
    lang:"🌍 Language",
    noMoney:"❌ Not enough balance",
    spinning:"🎰 Spinning...",
    lose:"😢 Lost",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"💰 (25-10000)"
  },
  ru:{
    menu:"🎰 Меню",
    play:"🎮 Играть (50⭐)",
    balance:"⭐ Баланс",
    buy:"💰 Пополнить",
    ref:"👥 Пригласить",
    withdraw:"💸 Вывод",
    my:"📄 Заявки",
    top:"🏆 Топ",
    lang:"🌍 Язык",
    noMoney:"❌ Недостаточно средств",
    spinning:"🎰 Крутится...",
    lose:"😢 Проигрыш",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"💰 (25-10000)"
  }
};

// MENU
function menu(u){
  const t = texts[u.lang];
  return {
    text:t.menu,
    reply_markup:{
      inline_keyboard:[
        [
          {text:t.play,callback_data:"play"},
          {text:t.balance,callback_data:"balance"},
          {text:t.buy,callback_data:"buy"}
        ],
        [
          {text:t.ref,callback_data:"ref"},
          {text:t.withdraw,callback_data:"withdraw"},
          {text:t.my,callback_data:"my"}
        ],
        [
          {text:t.top,callback_data:"top"},
          {text:t.lang,callback_data:"lang"}
        ]
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

// START
bot.onText(/\/start/, async (msg)=>{
  const id = msg.chat.id;
  let u = await getUser(id);

  if(!u){
    u = {stars:100,refs:0,lang:null};
    await saveUser(id,u);
  }

  if(!u.lang){
    return bot.sendMessage(id,"🌍 Dil seç / Choose language",langMenu());
  }

  bot.sendMessage(id,menu(u).text,{reply_markup:menu(u).reply_markup});
});

// BUY INPUT
bot.on("message", async (msg)=>{
  const id = msg.chat.id;
  let u = await getUser(id);
  if(!u || !u.waiting) return;

  let n = parseInt(msg.text);

  if(n>=25 && n<=10000){
    u.stars += n;
    u.waiting = false;
    await saveUser(id,u);

    return bot.sendMessage(id,`✅ +${n}⭐`,{
      reply_markup:menu(u).reply_markup
    });
  }
});

// CALLBACKS
bot.on("callback_query", async (q)=>{
  try{ await bot.answerCallbackQuery(q.id); }catch(e){}

  const id = q.message.chat.id;
  const mid = q.message.message_id;
  const data = q.data;

  let u = await getUser(id);
  if(!u) return;

  const t = texts[u.lang];

  // PLAY
  if(data==="play"){
    if(u.stars < SPIN_COST){
      return bot.editMessageText(t.noMoney,{
        chat_id:id,
        message_id:mid,
        reply_markup:backBtn()
      });
    }

    u.stars -= SPIN_COST;
    await saveUser(id,u);

    await bot.editMessageText(t.spinning,{
      chat_id:id,
      message_id:mid
    });

    await new Promise(r => setTimeout(r, 1000));

    let win = spin();

    if(win>0){
      u.stars += win;
    }

    await saveUser(id,u);

    return bot.editMessageText(
      win>0 ? `${t.win(win)}\n⭐ ${u.stars}` : `${t.lose}\n⭐ ${u.stars}`,
      {
        chat_id:id,
        message_id:mid,
        reply_markup:backBtn()
      }
    );
  }

  // BALANCE
  if(data==="balance"){
    return bot.editMessageText(`⭐ ${u.stars}\n👥 ${u.refs}`,{
      chat_id:id,
      message_id:mid,
      reply_markup:backBtn()
    });
  }

  // BUY
  if(data==="buy"){
    u.waiting = true;
    await saveUser(id,u);

    return bot.editMessageText(t.ask,{
      chat_id:id,
      message_id:mid,
      reply_markup:backBtn()
    });
  }

  // REF
  if(data==="ref"){
    const link = `https://t.me/${process.env.BOT_USERNAME}?start=${id}`;

    return bot.editMessageText(`${link}\n👥 ${u.refs}`,{
      chat_id:id,
      message_id:mid,
      reply_markup:backBtn()
    });
  }

  // LEADERBOARD
  if(data==="top"){
    let top = await redis.zrange("leaderboard", 0, 9, { rev: true });

    let text = t.top + "\n\n";

    for(let i=0;i<top.length;i++){
      let uid = top[i];
      let user = await getUser(uid);
      text += `${i+1}. ${uid} - ⭐ ${user?.stars || 0}\n`;
    }

    return bot.editMessageText(text,{
      chat_id:id,
      message_id:mid,
      reply_markup:backBtn()
    });
  }

  // MENU
  if(data==="menu"){
    return bot.editMessageText(menu(u).text,{
      chat_id:id,
      message_id:mid,
      reply_markup:menu(u).reply_markup
    });
  }

  // LANG
  if(data==="lang"){
    return bot.editMessageText("🌍",{
      chat_id:id,
      message_id:mid,
      reply_markup:langMenu().reply_markup
    });
  }

  if(data.startsWith("lang_")){
    u.lang = data.split("_")[1];
    await saveUser(id,u);

    return bot.editMessageText(menu(u).text,{
      chat_id:id,
      message_id:mid,
      reply_markup:menu(u).reply_markup
    });
  }
});

// SERVER (RENDER FIX)
const PORT = process.env.PORT || 3000;

app.post(`/bot${process.env.BOT_TOKEN}`, (req,res)=>{
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req,res)=>{
  res.send("Bot is alive");
});

app.listen(PORT, ()=>{
  console.log("Server running on port " + PORT);
});
