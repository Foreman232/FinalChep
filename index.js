// index.js actualizado para WhatsApp (360dialog) <-> Chatwoot
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
app.use(bodyParser.json());

// Config
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
const CHATWOOT_BASE_URL = 'https://app.chatwoot.com/api/v1/accounts';
const D360_API_URL = 'https://waba-v2.360dialog.io/messages';
const D360_API_TOKEN = 'icCVWtPvpn2Eb9c2C5wjfA4NAK';

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
    const res = await axios.post(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts`, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return res.data.payload;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      const resp = await axios.get(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      return resp.data.payload[0];
    }
    console.error('Error creando contacto:', err.response?.data || err.message);
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
  } catch (err) {
    if (!err.response?.data?.message?.includes('has already been taken')) {
      console.error('Error linkeando contacto:', err.response?.data || err.message);
    }
  }
}

// Obtener o crear conversación
async function getOrCreateConversation(contactId, sourceId) {
  try {
    const res = await axios.get(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    if (res.data.payload.length > 0) return res.data.payload[0].id;

    const newConv = await axios.post(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      inbox_id: CHATWOOT_INBOX_ID,
      source_id
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return newConv.data.id;
  } catch (err) {
    console.error('Error obteniendo/creando conversación:', err.response?.data || err.message);
    return null;
  }
}

// Enviar mensaje a Chatwoot (solo si no es enviado por Chatwoot)
async function sendToChatwoot(conversationId, content) {
  try {
    await axios.post(`${CHATWOOT_BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch (err) {
    console.error('Error enviando a Chatwoot:', err.response?.data || err.message);
  }
}

// Webhook de entrada desde 360dialog
app.post('/webhook', async (req, res) => {
  const data = req.body;
  try {
    const value = data?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    const phone = value?.contacts?.[0]?.wa_id;
    const name = value?.contacts?.[0]?.profile?.name;

    // Ignorar mensajes sin número o sin contenido reconocible
    if (!phone || !message) return res.sendStatus(200);

    const type = message.type;
    let content = '';
    if (type === 'text') content = message.text.body;
    else if (type === 'image') content = '[Imagen recibida]';
    else if (type === 'audio') content = '[Nota de voz recibida]';
    else content = `[Mensaje tipo ${type} recibido]`;

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await linkContactToInbox(contact.id, phone);
    const convId = await getOrCreateConversation(contact.id, contact.identifier);
    if (!convId) return res.sendStatus(500);

    await sendToChatwoot(convId, content);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error en webhook 360dialog:', err.message);
    res.sendStatus(500);
  }
});

// Webhook para mensajes salientes desde Chatwoot
app.post('/outbound', async (req, res) => {
  try {
    const { content, conversation } = req.body;
    const phone = conversation?.meta?.sender?.phone_number?.replace('+', '');

    if (!phone || !content) return res.sendStatus(200);

    await axios.post(D360_API_URL, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: content }
    }, {
      headers: {
        'D360-API-KEY': D360_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    res.sendStatus(200);
  } catch (err) {
    console.error('Error enviando a WhatsApp:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Webhook corriendo en puerto ${PORT}`));
