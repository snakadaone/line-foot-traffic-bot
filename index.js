// ✅ 修正版本：支援歡迎訊息、位置、營業時間（回覆式 quickReply）
require('dotenv').config();

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
    const { latitude, longitude } = event.message;
  
    // 🔁 Reverse geocode to get city
    const city = await reverseGeocode(latitude, longitude);
  
    // ✅ Add log to debug
    console.log('🌆 Reverse geocoded city:', city);

    // ✅ Get weather forecast for this city
    const weather = await getWeatherForecast(city)

    // ✅ Save to userState
    userState[userId] = {
      ...userState[userId],
      location: { lat: latitude, lng: longitude },
      city,
      weather  // ← new addition
    };
  
    await replyText(
        event.replyToken,
        `✅ 已收到您的位置！\n📍 您所在的城市是：${city}\n☀️ 白天：${weather.morning}\n🌆 下午：${weather.afternoon}\n🌙 晚上：${weather.night}\n\n請繼續輸入「設定營業時間」`
      );
      
  }
  

  // 使用者輸入：設定營業時間
  else if (text === '設定營業時間') {
    userState[userId] = { step: 'start' };
    await sendTimeQuickReply(event.replyToken, '請選擇營業開始時間：', 'start', 'first');
  }
  else if (text === '查看更多開始時間') {
    await sendTimeQuickReply(event.replyToken, '請選擇營業開始時間：', 'start', 'second');
  }
  
  else if (text === '查看更多結束時間') {
    await sendTimeQuickReply(event.replyToken, '請選擇營業結束時間：', 'end', 'second');
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
const { Client } = require('@googlemaps/google-maps-services-js');
const googleClient = new Client({});

async function reverseGeocode(lat, lng) {
  try {
    const res = await googleClient.reverseGeocode({
      params: {
        latlng: { lat, lng },
        key: process.env.GOOGLE_MAPS_API_KEY,
        language: 'zh-TW'
      },
    });

    const results = res.data.results;
    let district = null;
    let county = null;

    for (const result of results) {
      for (const comp of result.address_components) {
        if (comp.types.includes('administrative_area_level_3')) {
          district = comp.long_name;
        }
        if (comp.types.includes('administrative_area_level_2')) {
          county = comp.long_name;
        }
      }
    }

    if (district && county) {
       // 只接受區／鎮／鄉等行政區，不要包含里名或太細的資料
       if (/^(.*?[區鎮鄉])$/.test(district)) {
         return `${county}${district}`;
        }
    }

    return null;
    
  } catch (error) {
    console.error('❗ reverseGeocode 錯誤:', error.response?.data || error);
    return null;
  }
}



async function sendTimeQuickReply(replyToken, promptText, step = 'start', range = 'first') {
    try {
      const hours =
        range === 'first'
          ? Array.from({ length: 12 }, (_, i) => i) // 0 ~ 11
          : Array.from({ length: 11 }, (_, i) => i + 13); // 13 ~ 23
  
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
  
      if (range === 'first') {
        quickReplyItems.push({
          type: 'action',
          action: {
            type: 'message',
            label: '⌛ 查看更多時段',
            text: step === 'start' ? '查看更多開始時間' : '查看更多結束時間'
          }
        });
      }
  
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
async function getWeatherForecast(districtName) {
  try {
    const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-093?Authorization=${process.env.CWB_API_KEY}&format=JSON&locationName=${encodeURIComponent(districtName)}`;

    const res = await axios.get(url);
    const locationData = res.data.records.locations[0].location[0];

    const times = locationData.weatherElement.find(el => el.elementName === 'Wx').time;

    // We'll grab 3 segments: morning, afternoon, night
    const morning = times[0];   // 06:00–12:00
    const afternoon = times[1]; // 12:00–18:00
    const night = times[2];     // 18:00–00:00

    const result = {
      morning: morning.elementValue[0].value,
      afternoon: afternoon.elementValue[0].value,
      night: night.elementValue[0].value
    };

    return result;
  } catch (error) {
    console.error('❗ getWeatherForecast 錯誤:', error.response?.data || error);
    return null;
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
