const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const CHANNEL_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

app.post('/webhook', async (req, res) => {
  const event = req.body.events?.[0];
  if (!event || !event.replyToken) return res.sendStatus(200);

  try {
    await axios.post('https://api.line.me/v2/bot/message/reply', {
      replyToken: event.replyToken,
      messages: [
        { type: 'text', text: '👋 Hello from your Node.js bot!' }
      ]
    }, {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error replying to LINE:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LINE Bot running on port ${PORT}`));
