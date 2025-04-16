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
    res.status(500).send('❗ Failed to fetch IP address');
  }
});


const port = process.env.PORT || 3000;
const districtProfiles = require('./data/district_profiles.json');
const temperatureMessages = require('./data/temperature_messages.json');



app.use(bodyParser.json());

const userState = {}; // 儲存每位使用者的營業時間選擇狀態

app.post('/webhook', express.json(), async (req, res) => {
  const events = req.body?.events;

  if (!Array.isArray(events) || events.length === 0) {
    console.warn('⚠️ 無效的 LINE 請求 (沒有 events)', req.body);
    return res.sendStatus(200); // Must return 200 to prevent LINE errors
  }

  const event = events[0];
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

      // 取得農曆日期
      const lunar = require('chinese-lunar');

    
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
  
      // 1️⃣ Confirm hours
      await replyText(event.replyToken, `✅ 營業時間確認完成！\n${start} ~ ${end}`);
  
      // 2️⃣ Calculate prediction
      const specialDayMap = require('./data/special_days_2025.json');
      const { dayType, boostTomorrowHoliday, note } = analyzeDayType(currentDate, specialDayMap);
      const profile = getDistrictProfile(city, districtOnly);
  
      const prediction = predictFootTraffic({
        districtProfile: profile,
        dayType: 'workday', // temporary placeholder
        weather,
        start,
        end,
        boostTomorrowHoliday: 0
      });
      
  
      const specialDayList = getSpecialDayInfo(formatDate(currentDate), specialDayMap);
      let specialDayText = '';

      if (specialDayList.length > 0) {
        // ✅ Format multiple items vertically
        specialDayText = '🎯 特別日子：\n' + specialDayList.map(d => `・${d}`).join('\n');
      } else {
        const nextInfo = getNextSpecialDayInfo(formatDate(currentDate), specialDayMap);
        const noDayPhrases = require('./data/no_special_day_phrases.json').no_special_day_phrases;
      
        let phrase = getRandomItem(noDayPhrases);
      
        // 避免與昨天相同
        if (userState[userId]?.lastNoSpecialDayPhrase === phrase && noDayPhrases.length > 1) {
          const alt = noDayPhrases.filter(p => p !== phrase);
          phrase = getRandomItem(alt);
        }
      
        userState[userId].lastNoSpecialDayPhrase = phrase;
      
        const countdownLine = nextInfo
          ? `⏳ 下個特別日子是「${nextInfo.name}」，還有 ${nextInfo.daysUntil} 天`
          : '📆 近期沒有特別日子。';
      
        specialDayText = `🎯 特別日子：\n${phrase}\n${countdownLine}`;
      }
      

      let temperatureLine = '';
      if (weather.maxTemp != null || weather.minTemp != null) {
        const max = weather.maxTemp != null ? `${weather.maxTemp}°C` : '未知';
        const min = weather.minTemp != null ? `${weather.minTemp}°C` : '未知';
        const comment = getTemperatureCommentByRange(weather.minTemp, weather.maxTemp);
        temperatureLine = `🌡️ 溫度範圍：${min} ~ ${max} → ${comment}`;
      } else {
        temperatureLine = '🌡️ 溫度範圍：氣溫不明 → 擺爛靠直覺';
      }



      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      const dayOfWeek = dayNames[currentDate.getDay()];
      const dateHeader = `📅 今天是 ${currentDate.getMonth() + 1}月${currentDate.getDate()}日（星期${dayOfWeek}）｜農曆${lunarDate}`;
      
      const fullMessage = `${dateHeader}
      ${specialDayText}
      📍 地點：${city}${districtOnly}
      ⛅ 天氣：
      早上 ${addWeatherEmoji(weather.morning)}
      下午 ${addWeatherEmoji(weather.afternoon)}
      晚上 ${addWeatherEmoji(weather.night)}
      ${temperatureLine}
      
      💡 今日吉日建議：
      ✅ 吉：擺攤、搶客、亂喊優惠
      ❌ 忌：高估人潮、自信開滿備貨
      
      🔥【人流預測】
      🟡 等級：${prediction.level}(${prediction.suggestion.includes('悲觀') ? '還不錯，但別幻想暴富' : '隨緣出貨，隨便贏'}）
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
    const locations = res.data?.records?.Locations?.[0]?.Location;
    const locationData = locations?.find(loc => loc.LocationName === districtOnly);

    if (!locationData) {
      console.error(`❗ 找不到區鄉鎮 ${districtOnly} in ${cityOnly}`);
      return null;
    }

    const weatherDesc = locationData.WeatherElement.find(e => e.ElementName === '天氣預報綜合描述');

    const segments = {
      morning: [],
      afternoon: [],
      night: []
    };

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];


    for (const period of weatherDesc.Time) {
      const start = new Date(period.StartTime);
      const hour = start.getHours();
      const dateStr = period.StartTime.split('T')[0];
      const description = period.ElementValue?.[0]?.WeatherDescription;

      if (!description) continue;

      if (dateStr === todayStr) {
        if (hour >= 6 && hour < 12) segments.morning.push(description);
        else if (hour >= 12 && hour < 18) segments.afternoon.push(description);
        else if (hour >= 18) segments.night.push(description); // tonight
      } else if (dateStr === tomorrowStr && hour < 6) {
        segments.night.push(description); // early morning of tomorrow
      }
    }


    function simplify(descList) {
      if (descList.length === 0) return '未知';
    
      const countMap = {};
      for (const desc of descList) {
        const short = desc.split('。')[0]; // 取主描述：例如「晴」、「多雲」、「短暫陣雨」
        countMap[short] = (countMap[short] || 0) + 1;
      }
    
      // 找出出現最多次的主描述
      const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
      return sorted[0][0]; // 回傳出現最多次的描述
    }
    
    

    // Extract temperature min/max
    const temps = [];
    for (const period of weatherDesc.Time) {
      if (!period.StartTime.startsWith(todayStr)) continue;
      const text = period.ElementValue[0].WeatherDescription;
      const match = text.match(/溫度攝氏(\d{1,2})(至(\d{1,2}))?/);
      if (match) {
        const t1 = parseInt(match[1], 10);
        const t2 = match[3] ? parseInt(match[3], 10) : t1;
        temps.push(t1, t2);
      }
    }

    const maxTemp = temps.length ? Math.max(...temps) : null;
    const minTemp = temps.length ? Math.min(...temps) : null;

    // 💬 Debug logs to inspect segmented descriptions
    console.log('🌞 Raw morning descriptions:', segments.morning);
    console.log('🌇 Raw afternoon descriptions:', segments.afternoon);
    console.log('🌙 Raw night descriptions:', segments.night);

    // 🧠 Simplify each before assigning
    const morningDesc = simplify(segments.morning);
    const afternoonDesc = simplify(segments.afternoon);
    const nightDesc = simplify(segments.night);

    console.log('📝 Simplified morning:', morningDesc);
    console.log('📝 Simplified afternoon:', afternoonDesc);
    console.log('📝 Simplified night:', nightDesc);

    const result = {
      morning: morningDesc,
      afternoon: afternoonDesc,
      night: nightDesc,
      maxTemp,
      minTemp
    };

    console.log('🌤️ Final parsed weather:', result);
    return result;

  } catch (err) {
    console.error('❗ 取得天氣預報失敗:', err.message);
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

const weatherMessages = require('./data/weather_messages.json');

function analyzeDayType(today, specialDayMap) {
  const todayStr = formatDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  const todayTags = specialDayMap[todayStr] || [];
  const tomorrowTags = specialDayMap[tomorrowStr] || [];

  const isTodayWeekend = today.getDay() === 0 || today.getDay() === 6;
  const isTodayHoliday = todayTags.includes('國定假日') || todayTags.includes('連假');
  const isTodayMakeup = todayTags.includes('補班');
  const isTomorrowHoliday = tomorrowTags.includes('國定假日') || tomorrowTags.includes('連假');

  const boostTomorrowHoliday = isTomorrowHoliday ? 1 : 0;

  const dayType =
    isTodayHoliday ? 'holiday' :
    isTodayMakeup ? 'makeupWorkday' :
    isTodayWeekend ? 'weekend' : 'workday';

  return {
    dayType,
    boostTomorrowHoliday,
    note: todayTags.join(', ') || null
  };
}

function getRandomWeatherComment(condition) {
  const list = weatherMessages[condition];
  if (!list || list.length === 0) return '';
  return list[Math.floor(Math.random() * list.length)];
}

function getSpecialDayInfo(dateStr, specialDayMap) {
  const todaySpecials = specialDayMap[dateStr];
  if (!todaySpecials) return [];

  return Object.values(todaySpecials).flat(); // 只取名字，不顯示分類
}


function getNextSpecialDayInfo(todayStr, specialDayMap) {
  const dates = Object.keys(specialDayMap).sort(); // 日期升序
  for (let dateStr of dates) {
    if (dateStr > todayStr) {
      const names = Object.values(specialDayMap[dateStr]).flat();
      return {
        name: names[0] || '未知',
        daysUntil: Math.ceil((new Date(dateStr) - new Date(todayStr)) / (1000 * 60 * 60 * 24))
      };
    }
  }
  return null;
}


function addWeatherEmoji(desc) {
  if (desc.includes('晴')) return `☀️ ${desc}`;
  if (desc.includes('多雲')) return `⛅ ${desc}`;
  if (desc.includes('陰')) return `☁️ ${desc}`;
  if (desc.includes('雨')) return `🌧️ ${desc}`;
  if (desc.includes('雷')) return `⛈️ ${desc}`;
  if (desc.includes('雪')) return `❄️ ${desc}`;
  if (desc.includes('風')) return `💨 ${desc}`;
  return `🌈 ${desc}`; // fallback emoji
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

const getRandomItem = arr => arr[Math.floor(Math.random() * arr.length)];

function getTemperatureCommentByRange(min, max) {
  if (min == null || max == null) return '氣溫不明 → 擺爛靠直覺';

  const avg = (min + max) / 2;
  let key = '';

  if (avg >= 35) key = 'very_hot';
  else if (avg >= 30) key = 'hot';
  else if (avg >= 25) key = 'warm';
  else if (avg >= 20) key = 'cool';
  else if (avg >= 15) key = 'chilly';
  else key = 'cold';

  const list = temperatureMessages[key] || [];
  return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : '靠毅力撐場';
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
