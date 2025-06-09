// index.js completo para Chatwoot + 360dialog (Cloud API)

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Configuraciones necesarias
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
const BASE_URL = 'https://app.chatwoot.com/api/v1/accounts';
const D360_API_KEY = 'icCVWtPvpn2Eb9c2C5wjfA4NAK';
const WHATSAPP_API_URL = 'https://waba-v2.360dialog.io/messages';

// Crear o recuperar contacto en Chatwoot
async function findOrCreateContact(phone, name = 'Cliente WhatsApp') {
  const identifier = `+${phone}`;
  const payload = {
    inbox_id: CHATWOOT_INBOX_ID,
    name,
    identifier,
    phone_number: identifier
  };
  try {
    const res = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts`, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return res.data.payload;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      const search = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      return search.data.payload[0];
    }
    console.error('❌ Error creando contacto:', err.message);
    return null;
  }
}

// Enlazar contacto al inbox
async function linkContactToInbox(contactId, phone) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/contact_inboxes`, {
      inbox_id: CHATWOOT_INBOX_ID,
      source_id: `+${phone}`
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch (err) {
    if (!err.response?.data?.message?.includes('has already been taken')) {
      console.error('❌ Error vinculando contacto:', err.message);
    }
  }
}

// Obtener o crear conversación en Chatwoot
async function getOrCreateConversation(contactId, sourceId) {
  try {
    const existing = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    if (existing.data.payload.length > 0) {
      return existing.data.payload[0].id;
    }
    const newConv = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      source_id: sourceId,
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return newConv.data.id;
  } catch (err) {
    console.error('❌ Error creando conversación:', err.message);
    return null;
  }
}

// Enviar mensaje a Chatwoot
async function sendMessageToChatwoot(conversationId, message) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: message,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch (err) {
    console.error('❌ Error enviando mensaje a Chatwoot:', err.message);
  }
}

// Webhook de entrada desde 360dialog
app.post('/webhook', async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    const phone = change?.contacts?.[0]?.wa_id;
    const name = change?.contacts?.[0]?.profile?.name;
    const msg = change?.messages?.[0];

    if (!msg || !phone) return res.sendStatus(200);

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await linkContactToInbox(contact.id, phone);
    const convId = await getOrCreateConversation(contact.id, contact.identifier);
    if (!convId) return res.sendStatus(500);

    let message = '';
    if (msg.type === 'text') {
      message = msg.text.body;
    } else if (msg.type === 'image') {
      message = '[Imagen recibida]';
    } else if (msg.type === 'audio') {
      message = '[Nota de voz recibida]';
    } else {
      message = `[Mensaje tipo ${msg.type} recibido]`;
    }

    await sendMessageToChatwoot(convId, message);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error en webhook:', err.message);
    res.sendStatus(500);
  }
});

// Webhook de salida desde Chatwoot
app.post('/outbound', async (req, res) => {
  try {
    const payload = req.body;
    const content = payload.content;
    const phone = payload.conversation?.meta?.sender?.phone_number?.replace('+', '');

    if (!phone || !content) return res.sendStatus(200);

    await axios.post(WHATSAPP_API_URL, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: content }
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
