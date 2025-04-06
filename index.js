require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

app.use(bodyParser.json());

// 模擬資料庫：儲存每位使用者的狀態
const userStates = new Map();

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  if (!events || events.length === 0) return res.sendStatus(200);

  for (let event of events) {
    const userId = event.source.userId;

    if (event.type === 'message') {
      const msg = event.message;

      // 📍處理位置訊息
      if (msg.type === 'location') {
        await replyMessage(userId, `✅ 已收到您的擺攤地點：${msg.address}`);
        continue;
      }

      // ⌨️ 處理文字訊息
      if (msg.type === 'text') {
        const text = msg.text;

        // 如果是第一次互動
        if (!userStates.has(userId)) {
          userStates.set(userId, {});
          await replyMessage(userId, `👋 歡迎使用人流預測機器人！\n\n請依照以下步驟開始設定：\n\n1️⃣ 傳送您的擺攤地點（使用 LINE 的「位置訊息」功能）\n2️⃣ 輸入「設定營業時間」以開始選擇時段`);
          continue;
        }

        // 處理營業時間設定流程
        const state = userStates.get(userId);

        if (text === '設定營業時間') {
          state.step = 'choose_start';
          userStates.set(userId, state);
          await sendTimeQuickReply(userId, '請選擇營業開始時間');
        } else if (state.step === 'choose_start') {
          state.startTime = text;
          state.step = 'choose_end';
          userStates.set(userId, state);
          await sendTimeQuickReply(userId, '請選擇營業結束時間');
        } else if (state.step === 'choose_end') {
          state.endTime = text;
          state.step = 'confirm';
          userStates.set(userId, state);
          await replyConfirm(userId, state.startTime, state.endTime);
        } else if (state.step === 'confirm') {
          if (text === '✅ 確認') {
            await replyMessage(userId, `✅ 您的營業時間已設定完成！`);
            state.step = null;
            userStates.set(userId, state);
          } else if (text === '🔁 重新設定') {
            state.step = 'choose_start';
            userStates.set(userId, state);
            await sendTimeQuickReply(userId, '請重新選擇營業開始時間');
          }
        }
      }
    }
  }

  res.sendStatus(200);
});

function replyMessage(userId, text) {
  return axios.post('https://api.line.me/v2/bot/message/push', {
    to: userId,
    messages: [{ type: 'text', text }]
  }, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
    }
  });
}

function sendTimeQuickReply(userId, prompt) {
  const times = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
  const items = times.map(t => ({ type: 'action', action: { type: 'message', label: t, text: t } }));

  return axios.post('https://api.line.me/v2/bot/message/push', {
    to: userId,
    messages: [
      {
        type: 'text',
        text: prompt,
        quickReply: { items }
      }
    ]
  }, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
    }
  });
}

function replyConfirm(userId, start, end) {
  return axios.post('https://api.line.me/v2/bot/message/push', {
    to: userId,
    messages: [
      {
        type: 'text',
        text: `您設定的營業時間為：\n⏰ 開始：${start}\n⏰ 結束：${end}\n\n請確認是否正確？`,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '✅ 確認', text: '✅ 確認' } },
            { type: 'action', action: { type: 'message', label: '🔁 重新設定', text: '🔁 重新設定' } }
          ]
        }
      }
    ]
  }, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
    }
  });
}

app.listen(PORT, () => {
  console.log(`🚀 LINE Bot running on port ${PORT}`);
});
