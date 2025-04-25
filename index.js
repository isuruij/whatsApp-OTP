require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Environment variables
const TOKEN = process.env.WABA_TOKEN;
const PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;
// Use Graph API version v22.0 for all WhatsApp Cloud API endpoints
const GRAPH_API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}`;

// Utility: generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// In-memory store for demo; swap out with Redis/DB in prod
const otpStore = new Map();

// 1) Send OTP endpoint, using your “first_test” template
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  const otp = generateOTP();
  otpStore.set(phone, { otp, expires: Date.now() + 5 * 60 * 1000 });

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: 'first_test',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: otp }
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: 0,
          parameters: [
            { type: 'text', text: phone } // Example value; adjust as needed
          ]
        }
      ]
    }
  };

  try {
    const resp = await axios.post(
      `${BASE_URL}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    res.json({ success: true, id: resp.data.messages?.[0]?.id });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ success: false, error: err.response?.data });
  }
});


// 2) Verify OTP endpoint
app.post('/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  const record = otpStore.get(phone);
  if (!record) return res.json({ valid: false, reason: 'No OTP sent' });

  if (Date.now() > record.expires) {
    otpStore.delete(phone);
    return res.json({ valid: false, reason: 'OTP expired' });
  }

  if (record.otp === otp) {
    otpStore.delete(phone);
    return res.json({ valid: true });
  }
  return res.json({ valid: false, reason: 'Incorrect OTP' });
});

// 3) Register phone number endpoint
app.post('/register', async (req, res) => {
  const { pin, data_localization_region } = req.body;
  const payload = { messaging_product: 'whatsapp', pin };
  if (data_localization_region) {
    payload.data_localization_region = data_localization_region;
  }

  try {
    const resp = await axios.post(`${BASE_URL}/register`, payload, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    res.json({ success: true, data: resp.data });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ success: false, error: err.response?.data });
  }
});

// 4) Deregister phone number endpoint
app.post('/deregister', async (req, res) => {
  try {
    const resp = await axios.post(`${BASE_URL}/deregister`, {}, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    res.json({ success: true, data: resp.data });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ success: false, error: err.response?.data });
  }
});

// 5) Webhook verification (GET)
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'my_verify_token';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.send(challenge);
  }
  res.sendStatus(403);
});

// 6) Webhook listener (POST)
app.post('/webhook', (req, res) => {
  console.log('Webhook event received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
