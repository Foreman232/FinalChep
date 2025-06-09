const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
const CHATWOOT_BASE = 'https://app.chatwoot.com/api/v1/accounts';
const DIALOG360_API_KEY = 'tu-api-key-de-360dialog';
const DIALOG360_URL = 'https://waba-v2.360dialog.io/messages';

// Crear o buscar contacto
async function findOrCreateContact(phone, name = 'Cliente WhatsApp') {
  const identifier = `+${phone}`;
  const payload = {
    inbox_id: CHATWOOT_INBOX_ID,
    name,
    identifier,
    phone_number: identifier
  };

  try {
    const res = await axios.post(`${CHATWOOT_BASE}/${CHATWOOT_ACCOUNT_ID}/contacts`, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return res.data.payload;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      const resp = await axios.get(`${CHATWOOT_BASE}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      return resp.data.payload[0];
    }
    console.error('Error creando contacto:', err.response?.data || err.message);
    return null;
  }
}

async function linkContactToInbox(contactId, phone) {
  try {
    await axios.post(`${CHATWOOT_BASE}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/contact_inboxes`, {
      inbox_id: CHATWOOT_INBOX_ID,
      source_id: `+${phone}`
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch (err) {
    if (!err.response?.data?.message?.includes('has already been taken')) {
      console.error('Error vinculando contacto:', err.response?.data || err.message);
    }
  }
}

async function getOrCreateConversation(contactId, sourceId) {
  try {
    const res = await axios.get(`${CHATWOOT_BASE}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    if (res.data.payload.length > 0) {
      return res.data.payload[0].id;
    }

    const conv = await axios.post(`${CHATWOOT_BASE}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      source_id: sourceId,
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return conv.data.id;
  } catch (err) {
    console.error('Error creando conversación:', err.response?.data || err.message);
    return null;
  }
}

async function sendMessageToChatwoot(conversationId, content) {
  try {
    await axios.post(`${CHATWOOT_BASE}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch (err) {
    console.error('Error enviando a Chatwoot:', err.response?.data || err.message);
  }
}

async function sendToWhatsApp(to, content) {
  try {
    await axios.post(DIALOG360_URL, {
      recipient_type: 'individual',
      to,
      type: 'text',
      messaging_product: 'whatsapp',
      text: { body: content }
    }, {
      headers: { 'D360-API-KEY': DIALOG360_API_KEY }
    });
  } catch (err) {
    console.error('Error enviando a WhatsApp:', err.response?.data || err.message);
  }
}

// Entrante desde 360dialog
app.post('/webhook', async (req, res) => {
  const data = req.body;
  const change = data.entry?.[0]?.changes?.[0]?.value;
  const phone = change?.contacts?.[0]?.wa_id;
  const name = change?.contacts?.[0]?.profile?.name;
  const messageObj = change?.messages?.[0];

  if (!phone || !messageObj) return res.sendStatus(200);

  let content = '[Contenido no soportado]';
  if (messageObj.type === 'text') {
    content = messageObj.text?.body;
  } else if (messageObj.type === 'image') {
    content = '[Imagen recibida]';
  } else if (messageObj.type === 'audio') {
    content = '[Nota de voz recibida]';
  }

  const contact = await findOrCreateContact(phone, name);
  if (!contact) return res.sendStatus(500);

  await linkContactToInbox(contact.id, phone);
  const conversationId = await getOrCreateConversation(contact.id, contact.identifier);
  if (!conversationId) return res.sendStatus(500);

  await sendMessageToChatwoot(conversationId, content);
  res.sendStatus(200);
});

// Saliente desde Chatwoot
app.post('/outbound', async (req, res) => {
  const payload = req.body;
  const phone = payload?.contact?.phone_number?.replace('+', '');
  const content = payload?.message?.content;
  const tipo = payload?.message?.message_type;

  if (!phone || !content || tipo !== 'outgoing') return res.sendStatus(200);

  await sendToWhatsApp(phone, content);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
