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

// TEXTS
const texts = {
  tr:{
    menu:"🎰 Menü",
    play:"🎮 Oyna",
    balance:"⭐ Bakiye",
    buy:"💰 Yükle",
    ref:"👥 Davet",
    withdraw:"💸 Çek",
    my:"📄 Taleplerim",
    lang:"🌍 Dil",
    withdrawMenu:"💸 Miktar seç",
    noMoney:"❌ Yetersiz bakiye",
    spinning:"🎰 Çark dönüyor...",
    lose:"😢 Kaybettin",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"(25-10000)",
    request:(id,a,d,t)=>`Talep #${id}\n${a}⭐\n${d} ${t}\n✅ Onaylandı`
  },
  en:{
    menu:"🎰 Menu",
    play:"🎮 Play",
    balance:"⭐ Balance",
    buy:"💰 Deposit",
    ref:"👥 Invite",
    withdraw:"💸 Withdraw",
    my:"📄 Requests",
    lang:"🌍 Language",
    withdrawMenu:"💸 Choose amount",
    noMoney:"❌ Not enough balance",
    spinning:"🎰 Spinning...",
    lose:"😢 Lost",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"(25-10000)",
    request:(id,a,d,t)=>`Request #${id}\n${a}⭐\n${d} ${t}\n✅ Approved`
  },
  ru:{
    menu:"🎰 Меню",
    play:"🎮 Играть",
    balance:"⭐ Баланс",
    buy:"💰 Пополнить",
    ref:"👥 Пригласить",
    withdraw:"💸 Вывод",
    my:"📄 Мои заявки",
    lang:"🌍 Язык",
    withdrawMenu:"💸 Выбери сумму",
    noMoney:"❌ Недостаточно средств",
    spinning:"🎰 Крутится...",
    lose:"😢 Проигрыш",
    win:(x)=>`🎉 +${x}⭐`,
    ask:"(25-10000)",
    request:(id,a,d,t)=>`Заявка #${id}\n${a}⭐\n${d} ${t}\n✅ Одобрено`
  }
};

// MENU (3'LÜ GRID)
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

// START
bot.onText(/\/start/, async (msg)=>{
  const id = msg.chat.id;

  let u = await getUser(id);

  if(!u){
    u = {stars:50,refs:0,lang:null};
    await saveUser(id,u);
  }

  if(!u.lang){
    return bot.sendMessage(id,"🌍",langMenu());
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

    const m = menu(u);
    return bot.editMessageText(m.text,{
      chat_id:id,
      message_id:mid,
      reply_markup:m.reply_markup
    });
  }

  // PLAY
  if(data==="play"){
    if(u.stars<=0){
      return bot.editMessageText(t.noMoney,{
        chat_id:id,
        message_id:mid,
        reply_markup:{inline_keyboard:[[{text:"🔙",callback_data:"menu"}]]}
      });
    }

    u.stars--;

    await bot.editMessageText(t.spinning,{chat_id:id,message_id:mid});
    await new Promise(r=>setTimeout(r,1000));

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
      reply_markup:{inline_keyboard:[[{text:"🔙",callback_data:"menu"}]]}
    });
  }

  // BALANCE
  if(data==="balance"){
    return bot.editMessageText(`⭐ ${u.stars}\n👥 ${u.refs}`,{
      chat_id:id,
      message_id:mid,
      reply_markup:{inline_keyboard:[[{text:"🔙",callback_data:"menu"}]]}
    });
  }

  // WITHDRAW MENU
  if(data==="withdraw"){
    return bot.editMessageText(t.withdrawMenu,{
      chat_id:id,
      message_id:mid,
      reply_markup:{
        inline_keyboard:[
          [15,25,50].map(a=>({text:`${a}⭐`,callback_data:`w_${a}`})),
          [100,350,500].map(a=>({text:`${a}⭐`,callback_data:`w_${a}`})),
          [650,1000].map(a=>({text:`${a}⭐`,callback_data:`w_${a}`})),
          [{text:"🔙",callback_data:"menu"}]
        ]
      }
    });
  }

  // REQUEST
  if(data.startsWith("w_")){
    const amount=parseInt(data.split("_")[1]);

    if(u.stars<amount){
      return bot.answerCallbackQuery(q.id,{text:"❌"});
    }

    u.stars-=amount;
    await saveUser(id,u);

    let idReq = await redis.incr("withdraw_counter");

    let now=new Date();
    let time=now.toLocaleTimeString();
    let date=now.toLocaleDateString();

    let list=await redis.get(`req_${id}`)||[];
    list.push({id:idReq,amount,date,time});
    await redis.set(`req_${id}`,list);

    await bot.editMessageText(
      t.request(idReq,amount,date,time),
      {
        chat_id:id,
        message_id:mid,
        reply_markup:{inline_keyboard:[[{text:"🔙",callback_data:"menu"}]]}
      }
    );

    bot.sendMessage(ADMIN_ID,
`🔥 NEW WITHDRAW
#${idReq}
@${q.from.username || "no_username"}
${amount}⭐
${date} ${time}`);
  }

  // MY REQUESTS
  if(data==="my"){
    let list=await redis.get(`req_${id}`)||[];

    let text=list.length
      ? list.map(r=>`#${r.id} ${r.amount}⭐`).join("\n")
      : "❌";

    return bot.editMessageText(text,{
      chat_id:id,
      message_id:mid,
      reply_markup:{inline_keyboard:[[{text:"🔙",callback_data:"menu"}]]}
    });
  }

  // MENU
  if(data==="menu"){
    const m=menu(u);
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
