const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL;

const bot = new TelegramBot(token);
const app = express();
app.use(express.json());

bot.on("error", console.log);
bot.on("webhook_error", console.log);

let users = {};

// 🌍 metinler
const texts = {
  tr: {
    play: "🎮 Oyna",
    balance: "⭐ Bakiye",
    lang: "🌍 Dil",
    spinning: "🎰 Çark dönüyor...",
    win: (x)=>`🎉 +${x}⭐ Kazandın!`,
    lose: "😢 Kaybettin",
    chooseLang: "Dil seç:",
    balanceText: (u)=>`⭐ ${u.stars}\n🎮 ${u.tries}`
  },
  en: {
    play: "🎮 Play",
    balance: "⭐ Balance",
    lang: "🌍 Language",
    spinning: "🎰 Spinning...",
    win: (x)=>`🎉 +${x}⭐ Won!`,
    lose: "😢 Lost",
    chooseLang: "Choose language:",
    balanceText: (u)=>`⭐ ${u.stars}\n🎮 ${u.tries}`
  },
  ru: {
    play: "🎮 Играть",
    balance: "⭐ Баланс",
    lang: "🌍 Язык",
    spinning: "🎰 Крутится...",
    win: (x)=>`🎉 +${x}⭐ выигрыш`,
    lose: "😢 Проигрыш",
    chooseLang: "Выберите язык:",
    balanceText: (u)=>`⭐ ${u.stars}\n🎮 ${u.tries}`
  }
};

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

// ana menü (temiz)
function menu(u){
  const t = texts[u.lang];
  return {
    text: "🎰",
    reply_markup:{
      inline_keyboard:[
        [{text:t.play,callback_data:"play"}],
        [
          {text:t.balance,callback_data:"balance"},
          {text:t.lang,callback_data:"change_lang"}
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

// webhook fix
setTimeout(()=>{
  bot.setWebHook(`${url}/bot${token}`);
},1500);

// START
bot.onText(/\/start/, (msg)=>{
  const id = msg.chat.id;

  if(!users[id]){
    users[id] = {stars:20,tries:10,lang:null};
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

    // dil seç
    if(data.startsWith("lang_")){
      u.lang = data.split("_")[1];
      const m = menu(u);

      return bot.editMessageText(m.text,{
        chat_id:id,
        message_id:mid,
        reply_markup:m.reply_markup
      });
    }

    // dil değiştir
    if(data==="change_lang"){
      return bot.editMessageText(texts[u.lang].chooseLang,{
        chat_id:id,
        message_id:mid,
        reply_markup:langMenu().reply_markup
      });
    }

    // 🎰 oyun
    if(data==="play"){
      const t = texts[u.lang];

      if(u.tries <= 0){
        return bot.editMessageText("❌ No tries",{
          chat_id:id,
          message_id:mid,
          reply_markup:{
            inline_keyboard:[
              [{text:"🔙",callback_data:"menu"}]
            ]
          }
        });
      }

      u.tries--;

      await bot.editMessageText(t.spinning,{
        chat_id:id,
        message_id:mid
      });

      await new Promise(r=>setTimeout(r,1500));

      let r = Math.random();
      let text = "";

      if(r < 0.6){
        text = t.lose;
      }else{
        let win = Math.floor(Math.random()*5)+1;
        u.stars += win;
        text = t.win(win);
      }

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

    // 🔙 menü
    if(data==="menu"){
      const m = menu(u);

      return bot.editMessageText(m.text,{
        chat_id:id,
        message_id:mid,
        reply_markup:m.reply_markup
      });
    }

    // ⭐ BAKİYE (İSTEDİĞİN GİBİ)
    if(data==="balance"){
      const t = texts[u.lang];

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

  }catch(e){
    console.log(e);
  }
});
