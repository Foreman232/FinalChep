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
      return getResp.data.payload[0] || null;
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
  } catch (err) {
    if (!err.response?.data?.message?.includes('has already been taken')) {
      console.error('Error vinculando contacto al inbox:', err.response?.data || err.message);
    }
  }
}

async function getOrCreateConversation(contactId, sourceId) {
  try {
    const res = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    if (res.data.payload.length > 0) return res.data.payload[0].id;

    const conv = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
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

async function sendMessageToChatwoot(conversationId, message) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: message,
      message_type: 'incoming',
      private: false
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
  } catch (err) {
    console.error('Error enviando mensaje a Chatwoot:', err.response?.data || err.message);
  }
}

app.post('/webhook', async (req, res) => {
  try {
    const changes = req.body?.entry?.[0]?.changes?.[0]?.value;
    const phone = changes?.contacts?.[0]?.wa_id;
    const name = changes?.contacts?.[0]?.profile?.name;
    const messageObj = changes?.messages?.[0];

    if (!phone || !messageObj) return res.sendStatus(200);

    if (messageObj.from_me) return res.sendStatus(200); // evitar loops

    let messageContent = '';
    if (messageObj.type === 'text') {
      messageContent = messageObj.text?.body;
    } else if (messageObj.type === 'image') {
      messageContent = '[Imagen recibida]';
    } else if (messageObj.type === 'audio') {
      messageContent = '[Nota de voz recibida]';
    } else {
      messageContent = `[${messageObj.type} recibido]`;
    }

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await linkContactToInbox(contact.id, phone);
    const conversationId = await getOrCreateConversation(contact.id, contact.identifier);
    if (!conversationId) return res.sendStatus(500);

    await sendMessageToChatwoot(conversationId, messageContent);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error en webhook:', err);
    res.sendStatus(500);
  }
});

app.post('/outbound', async (req, res) => {
  try {
    const message = req.body;
    const to = message?.conversation?.meta?.sender?.phone_number?.replace('+', '');
    const text = message?.content;

    if (!to || !text) return res.sendStatus(200);

    await axios.post(WHATSAPP_API_URL, {
      recipient_type: 'individual',
      to,
      type: 'text',
      messaging_product: 'whatsapp',
      text: { body: text }
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`
      }
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('Error enviando a WhatsApp:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Webhook corriendo en puerto ${PORT}`));
