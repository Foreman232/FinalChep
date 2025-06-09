// index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
const CHATWOOT_BASE_URL = 'https://app.chatwoot.com/api/v1/accounts';
const D360_API_KEY = process.env.D360_API_KEY; // Usa variable de entorno

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
    const response = await axios.post(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts`, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return response.data.payload;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      const getResp = await axios.get(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      return getResp.data.payload[0];
    }
    return null;
  }
}

// Vincular contacto al inbox
async function linkContactToInbox(contactId, phone) {
  try {
    await axios.post(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/contact_inboxes`, {
      inbox_id: CHATWOOT_INBOX_ID,
      source_id: `+${phone}`
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch (err) {}
}

// Obtener o crear conversación
async function getOrCreateConversation(contactId, sourceId) {
  try {
    const convRes = await axios.get(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    if (convRes.data.payload.length > 0) return convRes.data.payload[0].id;

    const newConv = await axios.post(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      source_id: sourceId,
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return newConv.data.id;
  } catch {
    return null;
  }
}

// Enviar mensaje a Chatwoot
async function sendMessageToChatwoot(conversationId, message) {
  await axios.post(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
    content: message,
    message_type: 'incoming'
  }, {
    headers: { api_access_token: CHATWOOT_API_TOKEN }
  });
}

// Entrante desde WhatsApp
app.post('/webhook', async (req, res) => {
  const data = req.body;
  const changes = data?.entry?.[0]?.changes?.[0]?.value;
  const phone = changes?.contacts?.[0]?.wa_id;
  const name = changes?.contacts?.[0]?.profile?.name;
  const message = changes?.messages?.[0]?.text?.body;
  if (!phone || !message) return res.sendStatus(200);

  const contact = await findOrCreateContact(phone, name);
  if (!contact) return res.sendStatus(500);

  await linkContactToInbox(contact.id, phone);
  const conversationId = await getOrCreateConversation(contact.id, contact.identifier);
  if (!conversationId) return res.sendStatus(500);

  await sendMessageToChatwoot(conversationId, message);
  res.sendStatus(200);
});

// Saliente desde Chatwoot hacia WhatsApp
app.post('/outbound', async (req, res) => {
  const data = req.body;
  const message = data?.content;
  const phone = data?.conversation?.meta?.sender?.phone_number;

  if (!message || !phone || data.private || data.message_type !== 'outgoing') {
    return res.sendStatus(200);
  }

  try {
    await axios.post('https://waba-v2.360dialog.io/messages', {
      messaging_product: 'whatsapp',
      to: phone.replace('+', ''),
      type: 'text',
      text: { body: message }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': D360_API_KEY
      }
    });
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error enviando a WhatsApp:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
