// ✅ 修正版本：支援歡迎訊息、位置、營業時間（回覆式 quickReply）
require('dotenv').config();

const CHANNEL_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;
const districtProfiles = require('./data/district_profiles.json');



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
  
    // 🔁 Reverse geocode to get city + district
    const cityDistrict = await reverseGeocode(latitude, longitude);

    if (!cityDistrict) {
      await replyText(event.replyToken, '❗ 無法取得您所在區域的天氣資料，請確認位置是否正確。');
      return;
  }

    console.log('🌆 Reverse geocoded cityDistrict:', cityDistrict);

    // 拆出 cityOnly 與 districtOnly 用來查詢 CWB API
    const match = cityDistrict.match(/^(.*?[市縣])(.*?[區鎮鄉])$/);
    const cityOnly = match?.[1];
    const districtOnly = match?.[2];

    console.log('🔍 cityOnly:', cityOnly);
    console.log('🔍 districtOnly:', districtOnly);

    const normalizedCity = normalizeCityName(cityOnly);
    const weather = await getWeatherForecast(normalizedCity, districtOnly);

    if (!weather) {
      await replyText(event.replyToken, '⚠️ 無法取得天氣預報，請稍後再試。');
      return;
    }

    // ✅ Save to userState AFTER confirming weather is valid
    userState[userId] = {
      ...userState[userId],
      location: { lat: latitude, lng: longitude },
      city: cityOnly,
      weather,
      districtOnly,
    };


    
  
    // 🔍 取得地區屬性
    console.log('🔎 正在查詢地區屬性資料 for:', `${cityOnly}${districtOnly}`);
    const profile = getDistrictProfile(cityOnly, districtOnly);
    const profileText = profile && Array.isArray(profile.features)
      ? `🧭 地區屬性：${profile.type}\n📌 ${profile.features.join('\n📌 ')}`
      : '⚠️ 尚未收錄此區域的屬性資料';


    await replyText(
      event.replyToken,
      `✅ 已收到您的位置！\n📍 您所在的城市是：${cityOnly}\n☀️ 白天：${weather.morning}\n🌆 下午：${weather.afternoon}\n🌙 晚上：${weather.night}\n\n${profileText}\n\n請繼續輸入「設定營業時間」`
);

      
  }
  

  // 使用者輸入：設定營業時間
  else if (text === '設定營業時間') {
    userState[userId] = {
      ...userState[userId], // ✅ preserve city, district, weather
      step: 'start'
    };
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
      
      // ✅ 1. Confirm hours via reply
      await replyConfirmTime(event.replyToken, start, end); // consumes replyToken
      
      // ✅ 2. Calculate prediction
      const city = userState[userId]?.city;
      const district = userState[userId]?.districtOnly;
      const weather = userState[userId]?.weather;
      
      if (!city || !district || !weather) {
        await pushText(userId, '⚠️ 找不到完整的地區或天氣資料，請重新傳送位置再設定一次營業時間。');
        return;
      }
      
      const currentDate = new Date();
      const holidayMap = require('./data/2025_holidays.json');
      const { dayType, boostTomorrowHoliday } = analyzeDayType(currentDate, holidayMap);
      const profile = getDistrictProfile(city, district);
      
      const prediction = predictFootTraffic({
        districtProfile: profile,
        dayType,
        weather,
        start,
        end,
        boostTomorrowHoliday
      });
      
      console.log('📤 人流預測訊息：', prediction);
      
      // ✅ 3. Push prediction message (separately)
      await pushText(userId, prediction.trim());
    }
      
  }

  // 初始歡迎訊息
  else if (text === '開始' || text === 'hi' || text === '你好') {
    await replyText(event.replyToken, `👋 歡迎使用人流預測機器人！

請依下列步驟完成設定：
1️⃣ 傳送您的地點（使用 LINE「位置訊息」功能)
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
    userState[userId] = {
      ...userState[userId], // ✅ keep location, city, district, weather!
      step: 'start'
    };
    await sendTimeQuickReply(event.replyToken, '請選擇營業開始時間：', 'start', 'first');
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

  // 💡 Sanitize ALL invisible/broken characters
  text = text
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // remove invisible junk
  .replace(/:/g, ':')                         // full-width colon to ASCII colon
  .replace(/[「」]/g, '"')                     // optional: standardize quotes
  .replace(/[^\S\r\n]+/g, ' ')                 // collapse excessive spacing
  .trim();


  console.log('🔤 Char codes:', [...text].map(c => c.charCodeAt(0)));

  const body = {
    replyToken,
    messages: [{ type: 'text', text }]
  };

  console.log('🧪 Cleaned text:', JSON.stringify(text));
  console.log('📤 回傳訊息內容：', JSON.stringify(body, null, 2));
  console.log('📏 回傳訊息長度:', body.messages[0].text.length);
  

  await axios.post(url, body, { headers });
}

// ✅ Send a push message (not using replyToken)
async function pushText(userId, text) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
  };

  // sanitize like replyText
  text = text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .replace(/:/g, ':')
    .replace(/[「」]/g, '"')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();

  const body = {
    to: userId,
    messages: [{ type: 'text', text }]
  };

  console.log('📤 推播訊息內容：', JSON.stringify(body, null, 2));
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
    let level1 = null; // e.g., 新北市
    let level2 = null; // e.g., 三峽區
    let level3 = null; // e.g., 中正里

    for (const result of results) {
      for (const comp of result.address_components) {
        const types = comp.types;
        const name = comp.long_name;

        if (types.includes('administrative_area_level_1')) {
          level1 = name;
        }
        if (types.includes('administrative_area_level_2')) {
          level2 = name;
        }
        if (types.includes('administrative_area_level_3')) {
          level3 = name;
        }
      }
    }

    console.log('🏙️ level1:', level1);
    console.log('🏘️ level2:', level2);
    console.log('🏡 level3:', level3);

    const district = /[區鎮鄉]$/.test(level2) ? level2 :
                     /[區鎮鄉]$/.test(level3) ? level3 : null;

    if (level1 && district) {
      return `${level1}${district}`; // e.g., 新北市三峽區
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
function normalizeCityName(name) {
  return name.replace(/^台/, '臺'); // 把台北市改成臺北市
}

const cityToDatasetId = {
  '基隆市': 'F-D0047-049',
  '臺北市': 'F-D0047-061',
  '新北市': 'F-D0047-069',
  '桃園市': 'F-D0047-005',
  '新竹市': 'F-D0047-053',
  '新竹縣': 'F-D0047-009',
  '苗栗縣': 'F-D0047-013',
  '臺中市': 'F-D0047-073',
  '彰化縣': 'F-D0047-017',
  '南投縣': 'F-D0047-021',
  '雲林縣': 'F-D0047-025',
  '嘉義市': 'F-D0047-057',
  '嘉義縣': 'F-D0047-029',
  '臺南市': 'F-D0047-077',
  '高雄市': 'F-D0047-065',
  '屏東縣': 'F-D0047-033',
  '宜蘭縣': 'F-D0047-001',
  '花蓮縣': 'F-D0047-041',
  '臺東縣': 'F-D0047-037',
  '澎湖縣': 'F-D0047-045',
  '金門縣': 'F-D0047-085',
  '連江縣': 'F-D0047-081'
};

async function getWeatherForecast(cityOnly, districtOnly) {
  try {
    const datasetId = cityToDatasetId[cityOnly];
    if (!datasetId) {
      console.error(`❗ 無對應的 datasetId for ${cityOnly}`);
      return null;
    }

    const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${datasetId}?Authorization=${process.env.CWB_API_KEY}&format=JSON`;
    const res = await axios.get(url);

    const root = res.data;
    const locations = root?.records?.Locations?.[0]?.Location;
    if (!locations) {
      console.error('❗ CWB 回傳格式錯誤或沒有資料', JSON.stringify(root, null, 2));
      return null;
    }

    const locationData = locations.find(loc => loc.LocationName === districtOnly);
    if (!locationData) {
      console.error(`❗ 找不到區鄉鎮 ${districtOnly} in ${cityOnly}`);
      const available = locations.map(l => l.LocationName);
      console.log('📍 可用地區:', available);
      return null;
    }

    const weatherElement = locationData.WeatherElement.find(el => el.ElementName === '天氣現象'); // 'Wx' is only in some endpoints
    const times = weatherElement?.Time;

    console.log('🕒 weatherElement.Time:', JSON.stringify(weatherElement.Time, null, 2));

    if (!times || times.length < 3) {
      console.error(`❗ 無法取得 ${districtOnly} 的天氣資料時間`);
      return null;
    }

    return {
      morning: times[0].ElementValue?.[0]?.Weather,
      afternoon: times[1].ElementValue?.[0]?.Weather,
      night: times[2].ElementValue?.[0]?.Weather
    };
      
  } catch (error) {
    console.error('❗ getWeatherForecast 錯誤:', error.response?.data || error.message);
    return null;
  }
}

function getDistrictProfile(city, district) {
  const key = `${city}${district}`;
  return districtProfiles[key] || null;
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
          text: `✅ 營業時間已設定為：\n${start} ~ ${end}\n請確認或重新設定:`,
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

  function formatDate(date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function analyzeDayType(today, holidayMap) {
  const todayStr = formatDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  const todayInfo = holidayMap[todayStr] || {};
  const tomorrowInfo = holidayMap[tomorrowStr] || {};

  const isTodayWeekend = today.getDay() === 0 || today.getDay() === 6;
  const isTomorrowHoliday = tomorrowInfo.status === 'holiday';

  const boostTomorrowHoliday = isTomorrowHoliday ? 1 : 0;

  const dayType =
    todayInfo.status === 'holiday' ? 'holiday' :
    todayInfo.status === 'makeupWorkday' ? 'makeupWorkday' :
    isTodayWeekend ? 'weekend' : 'workday';

  return {
    dayType,
    note: todayInfo.note || null,
    boostTomorrowHoliday
  };
}

function predictFootTraffic({ districtProfile, dayType, weather, start, end, boostTomorrowHoliday }) {
  const type = districtProfile?.type || '未知';
  const features = districtProfile?.features || [];

  let score = 0;

  // 🎯 區域類型
  if (type.includes('觀光')) score += 2;
  if (type.includes('商業')) score += 1;
  if (type.includes('學區')) score += (dayType === 'workday' ? 1 : -1);

  // 🗓️ 今天是週末/假日就加分
  if (dayType === 'weekend' || dayType === 'holiday') score += 2;
  if (dayType === 'makeupWorkday') score -= 1;

  // 🎁 明天放假，今天加分
  if (boostTomorrowHoliday) score += 1;

  // 🌧️ 天氣扣分
  const badWeather = [weather.morning, weather.afternoon, weather.night]
    .filter(w => w.includes('雨') || w.includes('雷') || w.includes('風'))
    .length;
  score -= badWeather;

  // 🕒 時段加分
  const startHour = parseInt(start);
  const endHour = parseInt(end);
  if (startHour >= 10 && endHour >= 18) score += 1;

  let level = '';
  let suggestion = '';
  if (score >= 4) {
    level = '高';
    suggestion = '多準備一些，可能會有好生意';
  } else if (score >= 2) {
    level = '中';
    suggestion = '照常準備即可';
  } else {
    level = '低';
    suggestion = '準備少量就好，節省成本';
  }
  
  return `等級：${level}。建議：${suggestion}`;
  
}



app.listen(port, () => {
  console.log(`🚀 LINE Bot 已啟動：埠號 ${port}`);
});
