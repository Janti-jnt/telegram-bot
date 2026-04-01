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

const SPIN_COST = 50;

const rewards = [
  {amount:5, chance:26},
  {amount:10, chance:14},
  {amount:35, chance:10},
  {amount:50, chance:7},
  {amount:100, chance:5},
  {amount:150, chance:3},
  {amount:500, chance:0.50},
  {amount:750, chance:0.03},
  {amount:850, chance:0.02},
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
    lang:"🌍 Dil",
    noMoney:"❌ Yetersiz bakiye",
    spinning:"🎰 Çark dönüyor...",
    lose:"😢 Kaybettin",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"💰 (25-10000)",
    waiting:"⏳ Bekleniyor"
  },
  en:{
    menu:"🎰 Menu",
    play:"🎮 Play (50⭐)",
    balance:"⭐ Balance",
    buy:"💰 Deposit",
    ref:"👥 Invite",
    withdraw:"💸 Withdraw",
    my:"📄 My requests",
    lang:"🌍 Language",
    noMoney:"❌ Not enough balance",
    spinning:"🎰 Spinning...",
    lose:"😢 Lost",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"💰 (25-10000)",
    waiting:"⏳ Pending"
  },
  ru:{
    menu:"🎰 Меню",
    play:"🎮 Играть (50⭐)",
    balance:"⭐ Баланс",
    buy:"💰 Пополнить",
    ref:"👥 Пригласить",
    withdraw:"💸 Вывод",
    my:"📄 Мои заявки",
    lang:"🌍 Язык",
    noMoney:"❌ Недостаточно средств",
    spinning:"🎰 Крутится...",
    lose:"😢 Проигрыш",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"💰 (25-10000)",
    waiting:"⏳ В ожидании"
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

// START + REF
bot.onText(/\/start(?: (.+))?/, async (msg,match)=>{
  const id = msg.chat.id;
  const ref = match[1];

  let u = await getUser(id);

  if(!u){
    u = {stars:100,refs:0,lang:null};
    await saveUser(id,u);

    if(ref && ref!=id){
      let refUser = await getUser(ref);
      if(refUser){
        refUser.stars += 1.5;
        refUser.refs += 1;
        await saveUser(ref,refUser);
      }
    }
  }

  if(!u.lang){
    return bot.sendMessage(id,"🌍",langMenu());
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

    const m = menu(u);

    return bot.sendMessage(id,`✅ +${n}⭐`,{
      reply_markup:m.reply_markup
    });
  }
});

// CALLBACKS
bot.on("callback_query", async (q)=>{
  const id = q.message.chat.id;
  const mid = q.message.message_id;
  const data = q.data;

  await bot.answerCallbackQuery(q.id);

  let u = await getUser(id);
  if(!u) return;

  const t = texts[u.lang];

  if(data==="play"){
    if(u.stars < SPIN_COST){
      return bot.editMessageText(t.noMoney,{chat_id:id,message_id:mid,reply_markup:backBtn()});
    }

    u.stars -= SPIN_COST;
    await bot.editMessageText(t.spinning,{chat_id:id,message_id:mid});

    await new Promise(r=>setTimeout(r,1000));

    let win = spin();

    if(win>0){
      u.stars += win;
      await saveUser(id,u);
      return bot.editMessageText(`${t.win(win)}\n⭐ ${u.stars}`,{chat_id:id,message_id:mid,reply_markup:backBtn()});
    } else {
      await saveUser(id,u);
      return bot.editMessageText(`${t.lose}\n⭐ ${u.stars}`,{chat_id:id,message_id:mid,reply_markup:backBtn()});
    }
  }

  if(data==="balance"){
    return bot.editMessageText(`⭐ ${u.stars}\n👥 ${u.refs}`,{chat_id:id,message_id:mid,reply_markup:backBtn()});
  }

  if(data==="buy"){
    u.waiting=true;
    await saveUser(id,u);
    return bot.editMessageText(t.ask,{chat_id:id,message_id:mid,reply_markup:backBtn()});
  }

  if(data==="ref"){
    const link = `https://t.me/${process.env.BOT_USERNAME}?start=${id}`;
    return bot.editMessageText(`${link}\n👥 ${u.refs}`,{chat_id:id,message_id:mid,reply_markup:backBtn()});
  }

  if(data==="withdraw"){
    return bot.editMessageText(t.withdraw,{
      chat_id:id,
      message_id:mid,
      reply_markup:{
        inline_keyboard:[
          [15,25,50].map(a=>({text:`${a}`,callback_data:`w_${a}`})),
          [100,350,500].map(a=>({text:`${a}`,callback_data:`w_${a}`})),
          [650,1000].map(a=>({text:`${a}`,callback_data:`w_${a}`})),
          [{text:"🔙",callback_data:"menu"}]
        ]
      }
    });
  }

  // 🔥 WITHDRAW + ADMIN BİLDİRİM
  if(data.startsWith("w_")){
    let amount = parseInt(data.split("_")[1]);

    if(u.stars < amount){
      return bot.answerCallbackQuery(q.id,{text:"❌"});
    }

    u.stars -= amount;
    await saveUser(id,u);

    let reqId = await redis.incr("withdraw_id");

    let list = await redis.get(`req_${id}`) || [];
    list.push({id:reqId,amount});
    await redis.set(`req_${id}`,list);

    // 🔔 ADMIN BİLDİRİM
    await bot.sendMessage(
      ADMIN_ID,
      `💸 NEW WITHDRAW\n\n#${reqId}\n👤 @${q.from.username || "no_username"}\n🆔 ${id}\n⭐ ${amount}`
    );

    return bot.editMessageText(
      `#${reqId}\n⭐ ${amount}\n${t.waiting}`,
      {
        chat_id:id,
        message_id:mid,
        reply_markup:backBtn()
      }
    );
  }

  if(data==="my"){
    let list = await redis.get(`req_${id}`) || [];
    let text = list.length
      ? list.map(r=>`#${r.id} ⭐ ${r.amount}`).join("\n")
      : "❌";

    return bot.editMessageText(text,{
      chat_id:id,
      message_id:mid,
      reply_markup:backBtn()
    });
  }

  if(data==="menu"){
    return bot.editMessageText(menu(u).text,{
      chat_id:id,
      message_id:mid,
      reply_markup:menu(u).reply_markup
    });
  }

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

// WEBHOOK
app.post(`/bot${process.env.BOT_TOKEN}`, (req,res)=>{
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req,res)=>res.send("ok"));
app.listen(process.env.PORT || 3000);
