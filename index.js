const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL;

const bot = new TelegramBot(token);
const app = express();
app.use(express.json());

// webhook kur
bot.setWebHook(`${url}/bot${token}`);

let users = {};

function menu(u){
  return {
    text: `🎮 MENU\n\n⭐ ${u.stars}\n🎮 ${u.tries}`,
    reply_markup:{
      inline_keyboard:[
        [{text:"🎮 Play",callback_data:"play"}],
        [{text:"⭐ Balance",callback_data:"balance"}]
      ]
    }
  };
}

// webhook endpoint
app.post(`/bot${token}`, (req,res)=>{
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// start
bot.onText(/\/start/, msg=>{
  const id = msg.chat.id;
  users[id] = {stars:20,tries:5};

  const m = menu(users[id]);
  bot.sendMessage(id, m.text, {reply_markup:m.reply_markup});
});

// buttons
bot.on("callback_query", async q=>{
  const id = q.message.chat.id;
  const mid = q.message.message_id;
  const data = q.data;

  await bot.answerCallbackQuery(q.id);

  let u = users[id];
  if(!u) return;

  if(data==="play"){
    if(u.tries<=0) return;

    u.tries--;

    let r = Math.random();
    let text = r<0.6 ? "😢 Lost" : "🎉 +5⭐";

    if(text.includes("+5")) u.stars+=5;

    bot.editMessageText(`${text}\n\n⭐ ${u.stars}\n🎮 ${u.tries}`,{
      chat_id:id,
      message_id:mid,
      reply_markup:{
        inline_keyboard:[
          [{text:"🔙 Menu",callback_data:"menu"}]
        ]
      }
    });
  }

  if(data==="menu"){
    const m = menu(u);
    bot.editMessageText(m.text,{
      chat_id:id,
      message_id:mid,
      reply_markup:m.reply_markup
    });
  }

  if(data==="balance"){
    bot.answerCallbackQuery(q.id,{text:`⭐ ${u.stars}`});
  }
});

app.get("/",(req,res)=>res.send("ok"));

app.listen(process.env.PORT || 3000, ()=>{
  console.log("running");
});
