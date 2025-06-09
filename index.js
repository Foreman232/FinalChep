// index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
const BASE_URL = 'https://app.chatwoot.com/api/v1/accounts';
const WHATSAPP_API_URL = 'https://waba-v2.360dialog.io/messages';
const WHATSAPP_API_TOKEN = 'icCVWtPvpn2Eb9c2C5wjfA4NAK';

// Crear o recuperar contacto
async function findOrCreateContact(phone, name = 'Cliente WhatsApp') {
  const identifier = `+${phone}`;
  const payload = {
    inbox_id: CHATWOOT_INBOX_ID,
    name,
    identifier,
    phone_number: identifier
  };
  try {
    const response = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts`, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return response.data.payload;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      const getResp = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      return getResp.data.payload[0];
    }
    return null;
  }
}

// Vincular contacto
async function linkContactToInbox(contactId, phone) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/contact_inboxes`, {
      inbox_id: CHATWOOT_INBOX_ID,
      source_id: `+${phone}`
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch {}
}

// Crear o usar conversación existente
async function getOrCreateConversation(contactId, sourceId) {
  const convRes = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
    headers: { api_access_token: CHATWOOT_API_TOKEN }
  });
  if (convRes.data.payload.length > 0) {
    return convRes.data.payload[0].id;
  }
  const newConv = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
    source_id: sourceId,
    inbox_id: CHATWOOT_INBOX_ID
  }, {
    headers: { api_access_token: CHATWOOT_API_TOKEN }
  });
  return newConv.data.id;
}

// Enviar mensaje entrante a Chatwoot
async function sendIncomingToChatwoot(conversationId, message) {
  await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
    content: message,
    message_type: 'incoming'
  }, {
    headers: { api_access_token: CHATWOOT_API_TOKEN }
  });
}

// Enviar mensaje a WhatsApp desde Chatwoot
app.post('/outbound', async (req, res) => {
  const { phone, message } = req.body;
  try {
    await axios.post(WHATSAPP_API_URL, {
      recipient_type: 'individual',
      to: phone.replace('+', ''),
      type: 'text',
      text: { body: message },
      messaging_product: 'whatsapp'
    }, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook de entrada desde WhatsApp
app.post('/webhook', async (req, res) => {
  const data = req.body;
  try {
    const entry = data.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (changes?.messages?.[0]?.from_me) return res.sendStatus(200);

    const phone = changes?.contacts?.[0]?.wa_id;
    const name = changes?.contacts?.[0]?.profile?.name;
    const message = changes?.messages?.[0]?.text?.body;

    if (!phone || !message) return res.sendStatus(200);

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await linkContactToInbox(contact.id, phone);
    const conversationId = await getOrCreateConversation(contact.id, contact.identifier);
    if (!conversationId) return res.sendStatus(500);

    await sendIncomingToChatwoot(conversationId, message);
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
