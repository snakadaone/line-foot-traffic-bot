// ✅ LINE Bot - Foot Traffic Setup (Traditional Chinese)

const CHANNEL_ACCESS_TOKEN = process.env.EW+GPaNwSUuhrj3btZXrACSP/5xGSk5Rg5mm/F8giRH74SEhVuHnnKhfQryfN/h8Xxe4NZfXIC0gp3XU22jEzWWTqa7zYNQVpg616Cx/9yFkzRsOe0NZzw69c0q8hLN+LMO8HGbkxLc+RiDFGJn8LAdB04t89/1O/w1cDnyilFU=;
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const userState = {}; // 儲存每位使用者的營業時間選擇狀態

app.post('/webhook', async (req, res) => {
  const event = req.body.events[0];
  const userId = event.source?.userId;
  const text = event.message?.text;
  const postbackData = event.postback?.data;

  console.log('📩 收到訊息:', text || postbackData);
  console.log('👤 使用者 ID:', userId);

  if (!userId) {
    console.error('⚠️ 使用者 ID 無法取得');
    return res.sendStatus(200);
  }

  if (text === '設定營業時間') {
    userState[userId] = { step: 'start' };
    await sendTimeQuickReply(userId, '請選擇營業開始時間：');
  } else if (postbackData?.startsWith('SELECT_TIME_')) {
    const hour = parseInt(postbackData.replace('SELECT_TIME_', ''));
    const label = `${hour.toString().padStart(2, '0')}:00`;

    if (userState[userId]?.step === 'start') {
      userState[userId].start = label;
      userState[userId].step = 'end';
      await sendTimeQuickReply(userId, '請選擇營業結束時間：');
    } else if (userState[userId]?.step === 'end') {
      userState[userId].end = label;
      const start = userState[userId].start;
      const end = userState[userId].end;
      await pushMessage(userId, {
        type: 'text',
        text: `✅ 營業時間已設定為：\n${start} ~ ${end}`
      });
      delete userState[userId];
    }
  } else {
    await replyText(event.replyToken, '您好！請使用選單操作～');
  }

  res.sendStatus(200);
});

async function replyText(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
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
    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
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
    console.error('⚠️ Error in sendTimeQuickReply:', error);
  }
}

app.listen(port, () => {
  console.log(`🚀 LINE Bot running on port ${port}`);
});
