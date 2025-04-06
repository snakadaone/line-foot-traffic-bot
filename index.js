// ✅ 修正版本：支援歡迎訊息、位置、營業時間（回覆式 quickReply）

const CHANNEL_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
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

  if (!userId) return res.sendStatus(200);

  // 使用者傳送位置
  if (event.message?.type === 'location') {
    await replyText(event.replyToken, `✅ 已收到您的位置！請繼續輸入「設定營業時間」`);
  }

  // 使用者輸入：設定營業時間
  else if (text === '設定營業時間') {
    userState[userId] = { step: 'start' };
    await sendTimeQuickReply(event.replyToken, '請選擇營業開始時間：');
  }

  // 使用者點選時間
  else if (postbackData?.startsWith('SELECT_TIME_')) {
    const hour = parseInt(postbackData.replace('SELECT_TIME_', ''));
    const label = `${hour.toString().padStart(2, '0')}:00`;

    if (userState[userId]?.step === 'start') {
      userState[userId].start = label;
      userState[userId].step = 'end';
      await sendTimeQuickReply(event.replyToken, '請選擇營業結束時間：');
    } else if (userState[userId]?.step === 'end') {
      userState[userId].end = label;
      const { start, end } = userState[userId];
      await replyConfirmTime(event.replyToken, start, end);
    }
  }

  // 初始歡迎訊息
  else if (text === '開始' || text === 'hi' || text === '你好') {
    await replyText(event.replyToken, `👋 歡迎使用人流預測機器人！

請依下列步驟完成設定：
1️⃣ 傳送您的地點（使用 LINE「位置訊息」功能）
2️⃣ 輸入「設定營業時間」並選擇時間`);
  }
  else if (text === '確認營業時間') {
    const { start, end } = userState[userId] || {};
    if (start && end) {
      await replyText(event.replyToken, `✅ 營業時間確認完成！\n${start} ~ ${end}`);
      delete userState[userId];
    } else {
      await replyText(event.replyToken, '⚠️ 尚未設定完成營業時間。請重新設定。');
    }
  }

  else if (text === '確認設定') {
    const { start, end } = userState[userId] || {};
    if (start && end) {
      await replyText(event.replyToken, `✅ 已成功設定營業時間：\n${start} ~ ${end}`);
      delete userState[userId]; // 清除暫存狀態
    } else {
      await replyText(event.replyToken, '⚠️ 無法確認設定，請重新操作一次。');
    }
  } else if (text === '重新設定') {
    userState[userId] = { step: 'start' };
    await sendTimeQuickReply(event.replyToken, '請重新選擇營業開始時間：', 'start');
  }
  
  // 其他訊息
  else {
    await replyText(event.replyToken, '請依照說明操作：\n1. 傳送位置\n2. 輸入「設定營業時間」');
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

async function sendTimeQuickReply(replyToken, promptText) {
  try {
    const hours = Array.from({ length: 13 }, (_, i) => i); // ✅ 限制最多 13 個按鈕
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

    const url = 'https://api.line.me/v2/bot/message/reply';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
    };

    const body = {
      replyToken,
      messages: [{
        type: 'text',
        text: promptText,
        quickReply: {
          items: quickReplyItems
        }
      }]
    };

    await axios.post(url, body, { headers });
  } catch (error) {
    console.error('❗ quickReply 發生錯誤：', error.response?.data || error);
  }
}
async function replyConfirmTime(replyToken, start, end) {
    const url = 'https://api.line.me/v2/bot/message/reply';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    };
  
    const body = {
      replyToken,
      messages: [
        {
          type: 'text',
          text: `✅ 營業時間已設定為：\n${start} ~ ${end}\n請確認或重新設定：`,
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: '✅ 確認',
                  text: '確認營業時間',
                },
              },
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: '🔄 重新設定',
                  text: '設定營業時間',
                },
              },
            ],
          },
        },
      ],
    };
  
    await axios.post(url, body, { headers });
  }
  
app.listen(port, () => {
  console.log(`🚀 LINE Bot 已啟動：埠號 ${port}`);
});
