// ✅ 修正版本：支援歡迎訊息、位置、營業時間（回覆式 quickReply）
require('dotenv').config();

const CHANNEL_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
// 🔍 Test your public IP address from Render
app.get('/myip', async (req, res) => {
  try {
    const ipRes = await axios.get('https://api.ipify.org?format=json');
    res.send(`🛰️ Render Public IP: ${ipRes.data.ip}`);
  } catch (error) {
    res.status

const port = process.env.PORT || 3000;
const districtProfiles = require('./data/district_profiles.json');
const temperatureMessages = require('./data/temperature_messages.json');



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
      districtOnly,
      weather    
    };
    
    console.log('🌤️ Saved weather data:', userState[userId].weather);



    
  
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
      const currentDate = new Date();

      // 取得節日與補班資訊
      const holidayMap = require('./data/2025_holidays.json');
      const { dayType, boostTomorrowHoliday, note } = analyzeDayType(currentDate, holidayMap);

      // 取得農曆日期
      const lunar = require('chinese-lunar');

      // 取得節氣
      const solarTerm = getSolarTerm(currentDate); // You'll define this helper next

    
      // ✅ Change to wait for confirmation
      userState[userId].step = 'confirm';
    
      // ✅ Show quick reply with "確認" or "重新設定"
      await replyConfirmTime(event.replyToken, start, end);
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
    const { start, end, city, districtOnly, weather } = userState[userId] || {};
    if (start && end && city && districtOnly && weather) {
      const currentDate = new Date();
  
      const chineseLunar = require('chinese-lunar');
      const lunarInfo = chineseLunar.solarToLunar(currentDate);
      console.log('🧪 lunarInfo:', JSON.stringify(lunarInfo, null, 2));

      console.log('🌙 lunarInfo:', lunarInfo); // debug

      const lunarMonth = lunarInfo?.month || 0;
      const lunarDay = lunarInfo?.day || 0;


      const lunarMonthName = getLunarMonthName(lunarMonth);
      const lunarDayName = getLunarDayName(lunarDay);
      const lunarDate = lunarMonthName && lunarDayName ? `${lunarMonthName}${lunarDayName}` : '未知日期';


      const solarTerm = getSolarTerm(currentDate); 
  
      // 1️⃣ Confirm hours
      await replyText(event.replyToken, `✅ 營業時間確認完成！\n${start} ~ ${end}`);
  
      // 2️⃣ Calculate prediction
      const holidayMap = require('./data/2025_holidays.json');
      const specialDayMap = require('./data/special_days_2025.json');
      const { dayType, boostTomorrowHoliday, note } = analyzeDayType(currentDate, holidayMap);
      const profile = getDistrictProfile(city, districtOnly);
  
      const prediction = predictFootTraffic({
        districtProfile: profile,
        dayType,
        weather,
        start,
        end,
        boostTomorrowHoliday
      });
  
      const specialDayList = getSpecialDayInfo(formatDate(currentDate), specialDayMap);
      const specialDayText = specialDayList.length > 0 ? `🎯 特別日子：${specialDayList.join('、')}\n` : '';
      const temperatureComment = getTemperatureMessage(weather.feelsLike);
      
      let temperatureLine = '';
      if (weather.maxTemp != null || weather.minTemp != null) {
        const max = weather.maxTemp != null ? `${weather.maxTemp}°C` : '未知';
        const min = weather.minTemp != null ? `${weather.minTemp}°C` : '未知';
        temperatureLine = `🌡️ 溫度範圍：${min} ~ ${max} → 擺攤不冷不熱剛剛好`;
      } else if (weather.feelsLike != null) {
        const feelsComment = getTemperatureMessage(weather.feelsLike);
        temperatureLine = `🌡️ 體感溫度：${weather.feelsLike}°C → ${feelsComment}`;
      } else {
        temperatureLine = '🌡️ 溫度範圍：氣溫不明 → 擺爛靠直覺';
      }






        const fullMessage = 
        `📅 今天是 ${currentDate.getMonth() + 1}月${currentDate.getDate()}日｜農曆${lunarDate}
        🏮 節氣：${solarTerm}
        🎌 西曆：${getDayTypeText(dayType)}
        🧧 傳統：${note || '沒有節日？那就自創理由擺！'}
        ${specialDayText}
        
        📍 地點：${city}${districtOnly}
        ⛅ 天氣：早上 ${weather.morning} / 下午 ${weather.afternoon} / 晚上 ${weather.night}
        ${temperatureLine}
        
        💡 今日吉日建議：
        ✅ 吉：擺攤、搶客、亂喊優惠
        ❌ 忌：高估人潮、自信開滿備貨
        
        🔥【人流預測】
        🟡 等級：${prediction.level}（${prediction.suggestion.includes('悲觀') ? '還不錯，但別幻想暴富' : '隨緣出貨，隨便贏'}）
        📦 建議：${prediction.suggestion}
        
        🧙‍♀️ 今日爛籤：
        ${prediction.quote}`;
        
  
      await pushText(userId, fullMessage);
      delete userState[userId];
    } else {
      await replyText(event.replyToken, '⚠️ 尚未設定完成營業時間或地區資料，請重新設定。');
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

    const weatherElement = locationData.WeatherElement.find(el => el.ElementName === '天氣現象');
    const atElement = locationData.WeatherElement.find(el => el.ElementName === 'AT');
    const times = weatherElement?.Time;
    

    if (!times || times.length < 3) {
      console.error(`❗ 無法取得 ${districtOnly} 的天氣資料時間`);
      return null;
    }
    
    let morning = '未知', afternoon = '未知', night = '未知';
    if (times && times.length >= 3) {
      morning = times[0].ElementValue?.[0]?.Value || '未知';
      afternoon = times[1].ElementValue?.[0]?.Value || '未知';
      night = times[2].ElementValue?.[0]?.Value || '未知';
    } else {
      console.warn(`❗ 時間段資料不足: ${districtOnly}`);
    }
    // 🔥 Extract Max and Min Temp
    let maxTemp = null;
    let minTemp = null;
    const tElement = locationData.WeatherElement.find(el => el.ElementName === 'T');

    if (Array.isArray(tElement?.Time) && tElement.Time.length > 0) {
      const temps = tElement.Time
        .flatMap(t => t.ElementValue?.map(ev => parseFloat(ev.Value)) || [])
        .filter(t => !isNaN(t));
    
      if (temps.length > 0) {
        maxTemp = Math.max(...temps);
        minTemp = Math.min(...temps);
        console.log('🌡️ maxTemp:', maxTemp, 'minTemp:', minTemp);
      } else {
        console.warn('⚠️ 找不到有效的溫度值');
      }
    } else {
      console.warn('⚠️ 沒有 T 元素或時間區段');
    }
    

  
    // 🔥 Extract Feels-like temperature
    let feelsLike = null;
    if (atElement?.Time?.[0]?.ElementValue?.[0]?.Value) {
      const temp = parseFloat(atElement.Time[0].ElementValue[0].Value);
      if (!isNaN(temp)) {
        feelsLike = temp;
      }
    }

    const result = {
      morning,
      afternoon,
      night,
      maxTemp,
      minTemp,
      feelsLike
    };

  } catch (error) {
    console.error('❗ 取得天氣預報時發生錯誤:', error.message);
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

function getLunarMonthName(month) {
  const names = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '臘月'];
  return names[month - 1] || '';
}

function getLunarDayName(day) {
  const chineseTens = ['初', '十', '廿', '三十'];
  const chineseNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';

  const ten = chineseTens[Math.floor((day - 1) / 10)];
  const num = chineseNums[(day - 1) % 10];

  return ten + num;
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

const weatherMessages = require('./data/weather_messages.json');

function getRandomWeatherComment(condition) {
  const list = weatherMessages[condition];
  if (!list || list.length === 0) return '';
  return list[Math.floor(Math.random() * list.length)];
}

function getSpecialDayInfo(dateStr, specialDayMap) {
  const todaySpecials = specialDayMap[dateStr];
  if (!todaySpecials) return [];

  // 將不同類型的 special day 展平為 array
  return Object.entries(todaySpecials).flatMap(([type, names]) => {
    return names.map(name => `${name}（${type}）`);
  });
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
  
  const quotes = [
    '「人多的時候你是邊角，人少的時候你是全場焦點。乾脆擺著等奇蹟。」',
    '「等的不是客，是運氣。」',
    '「沒賣完不是你廢，是人潮在擺爛。」'
  ];
  
  return {
    level,
    suggestion,
    quote: quotes[Math.floor(Math.random() * quotes.length)]
  };
  
  
}

function getSolarTerm(date) {
  const solarTerms = require('./data/solar_terms_2025.json');
  const todayStr = formatDate(date);
  return solarTerms[todayStr] || '清明過後懶得動';
}

const getRandomItem = arr => arr[Math.floor(Math.random() * arr.length)];

function getTemperatureMessage(feelsLikeCelsius) {
  if (feelsLikeCelsius === null || isNaN(feelsLikeCelsius)) {
    return '氣溫不明，但人還是要出門'; // fallback
  }

  let key = '';
  if (feelsLikeCelsius >= 35) {
    key = 'very_hot';
  } else if (feelsLikeCelsius >= 30) {
    key = 'hot';
  } else if (feelsLikeCelsius >= 25) {
    key = 'warm';
  } else if (feelsLikeCelsius >= 20) {
    key = 'cool';
  } else if (feelsLikeCelsius >= 15) {
    key = 'chilly';
  } else {
    key = 'cold';
  }

  const messages = temperatureMessages[key];
  if (messages && messages.length > 0) {
    return getRandomItem(messages);
  } else {
    return '氣溫正常發揮，靠實力擺攤'; // fallback if array is empty
  }
}


function getDayTypeText(dayType) {
  switch (dayType) {
    case 'holiday': return '國定假日 🛋️';
    case 'weekend': return '週末 🤙';
    case 'makeupWorkday': return '補班日 🧨';
    case 'workday': return '平日 🥱';
    default: return '未知';
  }
}


app.listen(port, () => {
  console.log(`🚀 LINE Bot 已啟動：埠號 ${port}`);
});
