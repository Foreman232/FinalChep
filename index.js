const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
const D360_API_KEY = 'icCVWtPvpn2Eb9c2C5wjfA4NAK'; // 360dialog API key
const BASE_URL = 'https://app.chatwoot.com/api/v1/accounts';

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

// Vincular contacto a inbox
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
      console.error('Error linkeando inbox:', err.response?.data || err.message);
    }
  }
}

// Obtener o crear conversación
async function getOrCreateConversation(contactId, sourceId) {
  try {
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
  } catch (err) {
    console.error('Error creando conversación:', err.response?.data || err.message);
    return null;
  }
}

// Enviar mensaje a Chatwoot (texto o multimedia)
async function sendToChatwoot(conversationId, body, tipo = 'incoming') {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, body, {
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
  } catch (err) {
    console.error('Error enviando mensaje a Chatwoot:', err.response?.data || err.message);
  }
}

// Webhook de entrada desde 360dialog
app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    const value = data.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];
    const phone = contact?.wa_id;
    const name = contact?.profile?.name;

    if (!message || !phone) return res.sendStatus(200);

    const chatContact = await findOrCreateContact(phone, name);
    if (!chatContact) return res.sendStatus(500);
    await linkContactToInbox(chatContact.id, phone);
    const conversationId = await getOrCreateConversation(chatContact.id, chatContact.identifier);
    if (!conversationId) return res.sendStatus(500);

    let payload = { message_type: 'incoming', private: false };

    if (message.text) {
      payload.content = message.text.body;
    } else if (message.image) {
      payload.attachments = [{ file_type: 'image', external_url: message.image.link }];
      payload.content = '[Imagen recibida]';
    } else if (message.voice) {
      payload.attachments = [{ file_type: 'audio', external_url: message.voice.link }];
      payload.content = '[Nota de voz recibida]';
    } else if (message.document) {
      payload.attachments = [{ file_type: 'file', external_url: message.document.link }];
      payload.content = `[Documento recibido: ${message.document.filename}]`;
    } else {
      payload.content = '[Mensaje no compatible]';
    }

    await sendToChatwoot(conversationId, payload);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error en webhook de entrada:', err.message);
    res.sendStatus(500);
  }
});

// Webhook para mensajes salientes desde Chatwoot
app.post('/outbound', async (req, res) => {
  const payload = req.body;
  const phone = payload?.contact?.phone_number?.replace('+', '');
  const message = payload?.content;

  if (!phone || !message) return res.sendStatus(200);

  try {
    await axios.post('https://waba.360dialog.io/messages', {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': D360_API_KEY
      }
    });
    console.log(`📤 Enviado a WhatsApp: ${message}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error enviando a WhatsApp:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Webhook corriendo en puerto ${PORT}`));
