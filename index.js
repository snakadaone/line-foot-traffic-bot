require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  if (!events || events.length === 0) {
    return res.status(200).send('No events');
  }

  for (let event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const replyToken = event.replyToken;
      const userMessage = event.message.text;

      const replyMessage = {
        replyToken: replyToken,
        messages: [
          {
            type: 'text',
            text: '👋 哈囉！你的機器人已啟動！'
          }
        ]
      };

      try {
        await axios.post('https://api.line.me/v2/bot/message/reply', replyMessage, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
          }
        });
      } catch (error) {
        console.error('Error replying to user:', error.message);
      }
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 LINE Bot running on port ${PORT}`);
});
