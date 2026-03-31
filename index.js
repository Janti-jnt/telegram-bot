const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');

const token = process.env.BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL;

const bot = new TelegramBot(token);
const app = express();
app.use(express.json());

bot.on("error", console.log);
bot.on("webhook_error", console.log);

// 📁 DATA KAYIT
let users = {};
try {
  users = JSON.parse(fs.readFileSync("users.json"));
} catch {
  users = {};
}

function saveUsers(){
  fs.writeFileSync("users.json", JSON.stringify(users,null,2));
}

// 🌍 TEXT
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
  },
  en: {
    play: "🎮 Play",
    balance: "⭐ Balance",
    buy: "💰 Buy",
    lang: "🌍 Language",
    spinning: "🎰 Spinning...",
    win: (x)=>`🎉 +${x}⭐ Won!`,
    lose: "😢 Lost",
    chooseLang: "Choose language:",
    noMoney: "❌ No stars",
    balanceText: (u)=>`⭐ ${u.stars}\n🎮 ${u.tries}`
  },
  ru: {
    play: "🎮 Играть",
    balance: "⭐ Баланс",
    buy: "💰 Купить",
    lang: "🌍 Язык",
    spinning: "🎰 Крутится...",
    win: (x)=>`🎉 +${x}⭐ выигрыш`,
    lose: "😢 Проигрыш",
    chooseLang: "Выберите язык:",
    noMoney: "❌ Нет звёзд",
    balanceText: (u)=>`⭐ ${u.stars}\n🎮 ${u.tries}`
  }
};

// menü
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

// dil menüsü
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

// webhook
app.post(`/bot${token}`, (req,res)=>{
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req,res)=>res.send("ok"));

app.listen(process.env.PORT || 3000);

// webhook fix
setTimeout(()=>{
  bot.setWebHook(`${url}/bot${token}`);
},1500);

// START
bot.onText(/\/start/, (msg)=>{
  const id = msg.chat.id;

  if(!users[id]){
    users[id] = {stars:0,tries:10,lang:null};
    saveUsers();
  }

  if(!users[id].lang){
    return bot.sendMessage(id,"🌍",langMenu());
  }

  const m = menu(users[id]);
  bot.sendMessage(id,m.text,{reply_markup:m.reply_markup});
});

// BUTTONS
bot.on("callback_query", async (q)=>{
  try{
    const id = q.message.chat.id;
    const mid = q.message.message_id;
    const data = q.data;

    await bot.answerCallbackQuery(q.id);

    let u = users[id];
    if(!u) return;

    const t = texts[u.lang];

    // dil seç
    if(data.startsWith("lang_")){
      u.lang = data.split("_")[1];
      saveUsers();

      const m = menu(u);

      return bot.editMessageText(m.text,{
        chat_id:id,
        message_id:mid,
        reply_markup:m.reply_markup
      });
    }

    // dil değiştir
    if(data==="change_lang"){
      return bot.editMessageText(t.chooseLang,{
        chat_id:id,
        message_id:mid,
        reply_markup:langMenu().reply_markup
      });
    }

    // 🎰 oyun
    if(data==="play"){
      if(u.stars <= 0){
        return bot.editMessageText(t.noMoney,{
          chat_id:id,
          message_id:mid,
          reply_markup:{
            inline_keyboard:[
              [{text:"💰",callback_data:"buy"}]
            ]
          }
        });
      }

      u.stars--;
      u.tries--;

      await bot.editMessageText(t.spinning,{
        chat_id:id,
        message_id:mid
      });

      await new Promise(r=>setTimeout(r,1200));

      let r = Math.random();
      let text = "";

      if(r < 0.6){
        text = t.lose;
      }else{
        let win = Math.floor(Math.random()*5)+1;
        u.stars += win;
        text = t.win(win);
      }

      saveUsers();

      return bot.editMessageText(
        `${text}\n\n⭐ ${u.stars}\n🎮 ${u.tries}`,
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

    // 💰 yükleme (fake)
    if(data==="buy"){
      return bot.editMessageText(
        "💰 Paket:",
        {
          chat_id:id,
          message_id:mid,
          reply_markup:{
            inline_keyboard:[
              [{text:"10⭐",callback_data:"buy10"}],
              [{text:"50⭐",callback_data:"buy50"}],
              [{text:"🔙",callback_data:"menu"}]
            ]
          }
        }
      );
    }

    if(data==="buy10"){
      u.stars += 10;
      saveUsers();
    }

    if(data==="buy50"){
      u.stars += 50;
      saveUsers();
    }

    if(data.startsWith("buy")){
      return bot.editMessageText(
        `✅ Yüklendi\n\n⭐ ${u.stars}`,
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

    // bakiye
    if(data==="balance"){
      return bot.editMessageText(
        t.balanceText(u),
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

    // menu
    if(data==="menu"){
      const m = menu(u);

      return bot.editMessageText(m.text,{
        chat_id:id,
        message_id:mid,
        reply_markup:m.reply_markup
      });
    }

  }catch(e){
    console.log(e);
  }
});
