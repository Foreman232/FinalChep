const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
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
    console.log('✅ Contacto creado:', response.data.payload.id);
    return response.data.payload;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      const getResp = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      return getResp.data.payload[0];
    }
    console.error('❌ Error creando contacto:', err.response?.data || err.message);
    return null;
  }
}

// Vincular contacto al inbox
async function linkContactToInbox(contactId, phone) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/contact_inboxes`, {
      inbox_id: CHATWOOT_INBOX_ID,
      source_id: `+${phone}`
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('🔗 Contacto vinculado al inbox');
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      return;
    }
    console.error('❌ Error vinculando contacto:', err.response?.data || err.message);
  }
}

// Obtener conversación existente o crear nueva
async function getOrCreateConversationId(contactIdentifier) {
  try {
    const search = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${contactIdentifier}`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });

    const contact = search.data.payload?.[0];
    const openConv = contact?.conversations?.find(c => c.status === 'open');

    if (openConv) {
      return openConv.id;
    }

    const newConv = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contact.id}/conversations`, {
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });

    return newConv.data.id;
  } catch (err) {
    console.error('❌ Error con conversación:', err.response?.data || err.message);
    return null;
  }
}

// Enviar mensaje entrante a Chatwoot
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

// Webhook 360dialog (Cloud API)
app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    const entry = data.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const phone = changes?.contacts?.[0]?.wa_id;
    const name = changes?.contacts?.[0]?.profile?.name;
    const message = changes?.messages?.[0]?.text?.body;

    if (!phone || !message) {
      console.log('⚠️ Mensaje ignorado (sin número o texto)');
      return res.sendStatus(200);
    }

    console.log(`📥 Mensaje recibido de ${phone}: ${message}`);

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await linkContactToInbox(contact.id, phone);

    const conversationId = await getOrCreateConversationId(contact.identifier);
    if (!conversationId) return res.sendStatus(500);

    await sendMessage(conversationId, message);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error general en webhook:', err.message);
    res.sendStatus(500);
  }
});

const PORT = 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
