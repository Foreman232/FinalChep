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
const WHATSAPP_API_TOKEN = 'Bearer icCVWtPvpn2Eb9c2C5wjfA4NAK';

// Crear o recuperar contacto
async function findOrCreateContact(phone, name = 'Cliente WhatsApp') {
  const identifier = `+${phone}`;
  const payload = {
    inbox_id: CHATWOOT_INBOX_ID,
    name,
    identifier,
    phone_number: identifier,
  };

  try {
    const res = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts`, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN },
    });
    return res.data.payload;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      const res = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN },
      });
      return res.data.payload[0];
    }
    console.error('Error creando contacto:', err.message);
    return null;
  }
}

// Vincular contacto al inbox
async function linkContactToInbox(contactId, phone) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/contact_inboxes`, {
      inbox_id: CHATWOOT_INBOX_ID,
      source_id: `+${phone}`,
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN },
    });
  } catch (err) {
    if (!err.response?.data?.message?.includes('has already been taken')) {
      console.error('Error vinculando contacto:', err.message);
    }
  }
}

// Obtener o crear conversación
async function getOrCreateConversation(contactId, sourceId) {
  try {
    const res = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN },
    });
    if (res.data.payload.length > 0) return res.data.payload[0].id;

    const conv = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      source_id: sourceId,
      inbox_id: CHATWOOT_INBOX_ID,
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN },
    });
    return conv.data.id;
  } catch (err) {
    console.error('Error en conversación:', err.message);
    return null;
  }
}

// Enviar mensaje a Chatwoot
async function sendMessageToChatwoot(conversationId, message, type = 'incoming', attachments = []) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: message,
      message_type: type,
      private: false,
      attachments,
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN },
    });
  } catch (err) {
    console.error('Error enviando a Chatwoot:', err.message);
  }
}

// Webhook desde WhatsApp (entrante)
app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const value = entry?.changes?.[0]?.value;
  const phone = value?.contacts?.[0]?.wa_id;
  const name = value?.contacts?.[0]?.profile?.name;
  const msg = value?.messages?.[0];

  if (!phone || !msg) return res.sendStatus(200);

  const contact = await findOrCreateContact(phone, name);
  if (!contact) return res.sendStatus(500);
  await linkContactToInbox(contact.id, phone);
  const conversationId = await getOrCreateConversation(contact.id, contact.identifier);
  if (!conversationId) return res.sendStatus(500);

  const attachments = [];
  let content = '';

  if (msg.type === 'text') {
    content = msg.text.body;
  } else if (msg.type === 'image') {
    content = '[Imagen recibida]';
    attachments.push({ file_type: 'image', external_url: msg.image?.link });
  } else if (msg.type === 'audio') {
    content = '[Nota de voz]';
    attachments.push({ file_type: 'audio', external_url: msg.audio?.link });
  } else if (msg.type === 'document') {
    content = '[Documento recibido]';
    attachments.push({ file_type: 'file', external_url: msg.document?.link });
  } else {
    content = `[Mensaje tipo ${msg.type} no procesado]`;
  }

  await sendMessageToChatwoot(conversationId, content, 'incoming', attachments);
  res.sendStatus(200);
});

// Webhook desde Chatwoot (saliente)
app.post('/outbound', async (req, res) => {
  const message = req.body;
  const number = message?.conversation?.meta?.sender?.phone_number?.replace('+', '');
  const content = message?.content;

  if (!number || !content) return res.sendStatus(200);

  try {
    const payload = {
      messaging_product: 'whatsapp',
      to: number,
      type: 'text',
      text: { body: content },
    };

    await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        Authorization: WHATSAPP_API_TOKEN,
        'Content-Type': 'application/json',
      },
    });
    console.log('✅ Mensaje enviado a WhatsApp');
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
