const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';

const CONTACT_API_URL = `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`;
const CONVERSATION_API_URL = `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`;
const MESSAGE_API_URL = `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`;

async function findOrCreateContact(phone, name = 'Cliente WhatsApp') {
  const payload = {
    identifier: phone,
    name: name,
    phone_number: `+${phone}`
  };

  try {
    const res = await axios.post(CONTACT_API_URL, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('✅ Contacto creado:', res.data.payload.identifier);
    return res.data.payload.identifier;
  } catch (err) {
    const msg = err.response?.data?.message || '';
    if (msg.includes('has already been taken')) {
      console.log('📌 Contacto existente:', phone);
      return phone;
    }
    console.error('❌ Error creando contacto:', msg);
    return null;
  }
}

async function createConversation(contactId) {
  try {
    const res = await axios.post(CONVERSATION_API_URL, {
      source_id: contactId,
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('✅ Conversación creada:', res.data.id);
    return res.data.id;
  } catch (err) {
    console.error('❌ Error creando conversación:', err.response?.data || err.message);
    return null;
  }
}

async function sendMessageToChatwoot(conversationId, content) {
  try {
    await axios.post(`${MESSAGE_API_URL}/${conversationId}/messages`, {
      content: content,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('✉️ Mensaje enviado a Chatwoot');
  } catch (err) {
    console.error('❌ Error enviando mensaje:', err.response?.data || err.message);
  }
}

app.post('/webhook', async (req, res) => {
  const data = req.body;

  try {
    const entry = data.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const phone = changes?.contacts?.[0]?.wa_id;
    const name = changes?.contacts?.[0]?.profile?.name;
    const message = changes?.messages?.[0]?.text?.body;

    if (!phone || !message) return res.sendStatus(200);

    console.log(`📥 Mensaje recibido de ${phone}: ${message}`);

    const contactId = await findOrCreateContact(phone, name);
    if (!contactId) return res.sendStatus(500);

    const conversationId = await createConversation(contactId);
    if (!conversationId) return res.sendStatus(500);

    await sendMessageToChatwoot(conversationId, message);

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error procesando mensaje:', error.message);
    res.sendStatus(500);
  }
});

const PORT = 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
