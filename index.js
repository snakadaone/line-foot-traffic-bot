const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const CHANNEL_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text;
      const userId = event.source?.userId;

      console.log('📩 收到文字訊息:', text);
      console.log('👤 使用者 ID:', userId);

      if (!userId) {
        console.error('⚠️ 使用者 ID 無法取得');
        return res.sendStatus(200);
      }

      if (text === '設定營業時間') {
        await sendTimeQuickReply(userId, '請選擇營業開始時間');
      } else {
        await replyText(event.replyToken, '您好！請使用選單操作～');
      }
    }
  }

  res.sendStatus(200);
});

async function replyText(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
  };
  const body = {
    replyToken,
    messages: [{ type: 'text', text }],
  };
  await axios.post(url, body, { headers });
}

async function pushMessage(userId, message) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
  };
  const body = {
    to: userId,
    messages: [message],
  };
  await axios.post(url, body, { headers });
}

async function sendTimeQuickReply(userId, promptText) {
  const quickReplyItems = [];

  for (let hour = 0; hour < 24; hour++) {
    const label = `${hour}:00`;
    quickReplyItems.push({
      type: 'action',
      action: {
        type: 'message',
        label,
        text: `營業時間 ${label}`,
      },
    });
  }

  const message = {
    type: 'text',
    text: promptText,
    quickReply: {
      items: quickReplyItems,
    },
  };

  await pushMessage(userId, message);
}

app.get('/', (req, res) => {
  res.send('🚀 LINE Bot running on port ' + PORT);
});

app.listen(PORT, () => {
  console.log(`🚀 LINE Bot running on port ${PORT}`);
});
