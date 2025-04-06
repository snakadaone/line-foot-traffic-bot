// ✅ LINE Bot - 歡迎訊息、位置分享與營業時間設定（繁體中文）

const CHANNEL_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const userState = {}; // 儲存使用者的營業時間設定進度

app.post('/webhook', async (req, res) => {
  const event = req.body.events[0];
  const userId = event.source?.userId;
  const message = event.message;
  const text = message?.text;
  const postbackData = event.postback?.data;

  console.log('📩 收到訊息:', text || postbackData);
  console.log('👤 使用者 ID:', userId);

  if (!userId) return res.sendStatus(200);

  // 使用者傳送位置
  if (message?.type === 'location') {
    await replyText(event.replyToken, `✅ 已收到您的位置！請繼續設定營業時間，輸入「設定營業時間」`);
  }
  // 開始設定營業時間
  else if (text === '設定營業時間') {
    userState[userId] = { step: 'start' };
    await sendTimeQuickReply(userId, '請選擇營業開始時間：');
  }
  // 使用者選擇時間
  else if (postbackData?.startsWith('SELECT_TIME_')) {
    const hour = parseInt(postbackData.replace('SELECT_TIME_', ''));
    const label = `${hour.toString().padStart(2, '0')}:00`;

    if (userState[userId]?.step === 'start') {
      userState[userId].start = label;
      userState[userId].step = 'end';
      await sendTimeQuickReply(userId, '請選擇營業結束時間：');
    } else if (userState[userId]?.step === 'end') {
      userState[userId].end = label;
      const { start, end } = userState[userId];
      await pushMessage(userId, {
        type: 'text',
        text: `✅ 營業時間已設定為：\n${start} ~ ${end}`
      });
      delete userState[userId];
    }
  }
  // 初次互動或其他訊息
  else if (text === '開始' || text === 'hi' || text === '你好') {
    await replyText(event.replyToken, `👋 歡迎使用人流預測機器人！

請依下列步驟完成設定：
1️⃣ 請分享您的店家位置（使用 LINE 的「位置」功能）
2️⃣ 輸入「設定營業時間」並選擇營業時段`);
  } else {
    await replyText(event.replyToken, '請依照說明操作：\n1. 傳送位置\n2. 輸入「設定營業時間」');
  }

  res.sendStatus(200);
});

async function replyText(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
  };
  const body = {
    replyToken,
    messages: [{ type: 'text', text }]
  };
  await axios.post(url, body, { headers });
}

async function pushMessage(userId, message) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
  };
  const body = {
    to: userId,
    messages: [message]
  };
  await axios.post(url, body, { headers });
}

async function sendTimeQuickReply(userId, promptText) {
  try {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const quickReplyItems = hours.map(hour => {
      const label = `${hour.toString().padStart(2, '0')}:00`;
      return {
        type: 'action',
        action: {
          type: 'postback',
          label,
          data: `SELECT_TIME_${hour}`,
          displayText: `已選擇 ${label}`
        }
      };
    });

    await pushMessage(userId, {
      type: 'text',
      text: promptText,
      quickReply: { items: quickReplyItems }
    });
  } catch (error) {
    console.error('⚠️ 錯誤：sendTimeQuickReply', error);
  }
}

app.listen(port, () => {
  console.log(`🚀 LINE Bot 已啟動，埠號 ${port}`);
});
