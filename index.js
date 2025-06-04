const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';

const CONTACT_API = `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`;
const CONVERSATION_API = `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`;
const MESSAGE_API = `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`;

async function findOrCreateContact(phone, name = 'Cliente WhatsApp') {
  const payload = {
    identifier: phone,
    name: name || 'Sin Nombre',
    phone_number: `+${phone}`
  };

  try {
    const response = await axios.post(CONTACT_API, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('✅ Contacto creado:', response.data.payload.identifier);
    return response.data.payload.identifier;
  } catch (err) {
    const msg = err.response?.data?.message || JSON.stringify(err.response?.data);
    if (msg.includes('has already been taken')) {
      console.log('ℹ️ Contacto ya existe:', phone);
      return phone;
    }
    console.error('❌ Error creando contacto:', msg);
    return null;
  }
}

async function createConversation(contactId) {
  try {
    const response = await axios.post(CONVERSATION_API, {
      source_id: contactId,
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('✅ Conversación creada:', response.data.id);
    return response.data.id;
  } catch (err) {
    const msg = err.response?.data?.message || JSON.stringify(err.response?.data);
    console.error('❌ Error creando conversación:', msg);
    return null;
  }
}

async function sendMessage(conversationId, message) {
  try {
    await axios.post(`${MESSAGE_API}/${conversationId}/messages`, {
      content: message,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('📨 Mensaje enviado a Chatwoot');
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

    if (!phone || !message) {
      console.log('⚠️ Mensaje ignorado (sin número o texto)');
      return res.sendStatus(200);
    }

    console.log(`📥 Nuevo mensaje de ${phone}: ${message}`);

    const contactId = await findOrCreateContact(phone, name);
    if (!contactId) return res.sendStatus(500);

    const conversationId = await createConversation(contactId);
    if (!conversationId) return res.sendStatus(500);

    await sendMessage(conversationId, message);

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error en webhook:', err.message);
    res.sendStatus(500);
  }
});

const PORT = 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
