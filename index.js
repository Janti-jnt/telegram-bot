const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Redis } = require('@upstash/redis');

const token = process.env.BOT_TOKEN;
const url = process.env.RENDER_EXTERNAL_URL;

// 🔥 REDIS (YENİ SİSTEM)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const bot = new TelegramBot(token);
const app = express();
app.use(express.json());

// kullanıcı al
async function getUser(id){
  return await redis.get(`user:${id}`);
}

// kullanıcı kaydet
async function saveUser(id, data){
  await redis.set(`user:${id}`, data);
}

// START
bot.onText(/\/start/, async (msg)=>{
  const id = msg.chat.id;

  let u = await getUser(id);

  if(!u){
    u = {stars:0};
    await saveUser(id,u);
  }

  bot.sendMessage(id, `⭐ ${u.stars}`);
});

// test (mesaj yazınca +1 yıldız)
bot.on("message", async (msg)=>{
  const id = msg.chat.id;

  let u = await getUser(id);
  if(!u) return;

  u.stars += 1;
  await saveUser(id,u);

  bot.sendMessage(id, `⭐ ${u.stars}`);
});

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
