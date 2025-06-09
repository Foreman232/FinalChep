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
const WHATSAPP_API_TOKEN = 'icCVWtPvpn2Eb9c2C5wjfA4NAK'; // Token de 360dialog

// Utilidades comunes
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

async function linkContactToInbox(contactId, phone) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/contact_inboxes`, {
      inbox_id: CHATWOOT_INBOX_ID,
      source_id: `+${phone}`
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch (_) {}
}

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
  } catch (_) {
    return null;
  }
}

async function sendMessageToChatwoot(conversationId, content, tipo = 'text') {
  const payload = {
    content,
    message_type: 'incoming',
    private: false
  };

  if (tipo !== 'text') {
    payload.content_type = tipo;
  }

  await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': CHATWOOT_API_TOKEN
    }
  });
}

// Webhook de entrada desde 360dialog
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const phone = changes?.contacts?.[0]?.wa_id;
    const name = changes?.contacts?.[0]?.profile?.name;
    const message = changes?.messages?.[0];

    if (!phone || !message) return res.sendStatus(200);

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await linkContactToInbox(contact.id, phone);
    const conversationId = await getOrCreateConversation(contact.id, contact.identifier);
    if (!conversationId) return res.sendStatus(500);

    if (message.text?.body) {
      await sendMessageToChatwoot(conversationId, message.text.body);
    } else if (message.image) {
      await sendMessageToChatwoot(conversationId, `📷 Imagen recibida: https://api.360dialog.io/media/${message.image.id}`, 'image');
    } else if (message.voice) {
      await sendMessageToChatwoot(conversationId, `🎤 Nota de voz recibida: https://api.360dialog.io/media/${message.voice.id}`, 'audio');
    } else if (message.document) {
      await sendMessageToChatwoot(conversationId, `📎 Documento recibido: https://api.360dialog.io/media/${message.document.id}`, 'file');
    } else if (message.location) {
      await sendMessageToChatwoot(conversationId, `📍Ubicación: https://maps.google.com/?q=${message.location.latitude},${message.location.longitude}`, 'location');
    } else {
      await sendMessageToChatwoot(conversationId, '📩 Nuevo tipo de mensaje recibido');
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error procesando mensaje:', err.message);
    res.sendStatus(500);
  }
});

// Webhook de salida desde Chatwoot
app.post('/outbound', async (req, res) => {
  try {
    const data = req.body;
    const message = data?.content;
    const phone = data?.sender?.phone_number?.replace('+', '');

    if (!message || !phone) return res.sendStatus(400);

    await axios.post(WHATSAPP_API_URL, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message }
    }, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`📤 Mensaje enviado a WhatsApp (${phone}): ${message}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error enviando mensaje a WhatsApp:', err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
