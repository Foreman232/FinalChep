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
      console.log('ℹ️ Contacto ya existe, buscando...');

      const getResp = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });

      const existing = getResp.data.payload[0];
      if (!existing || !existing.id) {
        console.error('❌ No se encontró el contacto existente');
        return null;
      }

      console.log('✅ Contacto recuperado:', existing.id);
      return existing;
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
    console.log('🔗 Contacto vinculado al inbox correctamente');
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      console.log('ℹ️ Contacto ya estaba vinculado al inbox');
      return;
    }
    console.error('❌ Error vinculando contacto al inbox:', err.response?.data || err.message);
  }
}

// Crear conversación
async function createConversation(sourceId) {
  try {
    const url = `${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`;
    const resp = await axios.post(url, {
      source_id: sourceId,
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });

    console.log('✅ Conversación creada:', resp.data.id);
    return resp.data.id;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('❌ Error creando conversación:', msg);

    if (err.response?.status === 422 && msg?.includes('already been taken')) {
      console.log('ℹ️ Conversación ya existe. Recuperando...');
      const existing = await getOpenConversationId(sourceId);
      return existing;
    }

    return null;
  }
}

// Obtener ID de conversación existente
async function getOpenConversationId(sourceId) {
  try {
    const res = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${sourceId}`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });

    const contact = res.data.payload[0];
    if (!contact) return null;

    const convs = contact.conversations;
    const open = convs?.find(c => c.status === 'open');
    if (open) {
      console.log('✅ Conversación existente recuperada:', open.id);
      return open.id;
    }

    return null;
  } catch (err) {
    console.error('❌ Error buscando conversación existente:', err.response?.data || err.message);
    return null;
  }
}

// Enviar mensaje de respuesta (outgoing)
async function sendMessage(conversationId, message) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: message,
      message_type: 'outgoing'
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('✅ Respuesta enviada desde Chatwoot');
  } catch (err) {
    console.error('❌ Error enviando respuesta:', err.response?.data || err.message);
  }
}

// Webhook de entrada
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
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

    await linkContactToInbox(contact.id, phone);

    const conversationId = await createConversation(contact.identifier);
    if (!conversationId) return res.sendStatus(500);

    await sendMessage(conversationId, '¡Hola! Recibimos tu mensaje y te responderemos pronto.');

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
