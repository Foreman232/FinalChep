const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';

const BASE_URL = 'https://app.chatwoot.com/api/v1/accounts';

async function findOrCreateContact(phone, name = 'Cliente WhatsApp') {
  const payload = {
    inbox_id: CHATWOOT_INBOX_ID,
    name: name || 'Sin Nombre',
    identifier: phone,
    phone_number: `+${phone}`
  };

  try {
    const response = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts`, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('✅ Contacto creado:', response.data.payload.identifier);
    return response.data.payload;
  } catch (err) {
    const msg = err.response?.data?.message || JSON.stringify(err.response?.data);
    if (msg.includes('has already been taken')) {
      console.log('ℹ️ Contacto ya existe:', phone);

      // Buscar el contacto existente
      const getResp = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${phone}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      return getResp.data.payload[0];
    }

    console.error('❌ Error creando contacto:', msg);
    return null;
  }
}

async function createConversation(contactId) {
  try {
    const resp = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      source_id: contactId,
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    return resp.data.id;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      // Ya existe conversación, obtenerla
      const resp = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      return resp.data.payload[0]?.id;
    }

    console.error('❌ Error creando conversación:', err.response?.data || err.message);
    return null;
  }
}

async function sendMessage(conversationId, message) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
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

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    const conversationId = await createConversation(contact.id);
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
