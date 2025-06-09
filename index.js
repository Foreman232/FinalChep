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
    console.log(':white_check_mark: Contacto creado:', response.data.payload.id);
    return response.data.payload;
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      console.log(':information_source: Contacto ya existe, buscando...');
      const getResp = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      const existing = getResp.data.payload[0];
      if (!existing || !existing.id) {
        console.error(':x: No se encontró el contacto existente');
        return null;
      }
      console.log(':white_check_mark: Contacto recuperado:', existing.id);
      return existing;
    }
    console.error(':x: Error creando contacto:', err.response?.data || err.message);
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
    console.log(':link: Contacto vinculado al inbox correctamente');
  } catch (err) {
    if (err.response?.data?.message?.includes('has already been taken')) {
      console.log(':information_source: Contacto ya estaba vinculado al inbox');
      return;
    }
    console.error(':x: Error vinculando contacto al inbox:', err.response?.data || err.message);
  }
}

// Usar conversación existente o crear nueva
async function getOrCreateConversation(contactId, sourceId) {
  try {
    const convRes = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contactId}/conversations`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    if (convRes.data.payload.length > 0) {
      console.log(':arrows_counterclockwise: Conversación existente recuperada:', convRes.data.payload[0].id);
      return convRes.data.payload[0].id;
    }
    const newConv = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      source_id: sourceId,
      inbox_id: CHATWOOT_INBOX_ID
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log(':white_check_mark: Conversación creada:', newConv.data.id);
    return newConv.data.id;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(':x: Error al obtener/crear conversación:', msg);
    return null;
  }
}

// Enviar mensaje entrante a Chatwoot
async function sendMessage(conversationId, message) {
  try {
    await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: message,
      message_type: 'incoming',
      private: false
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': CHATWOOT_API_TOKEN
      }
    });
    console.log(':incoming_envelope: Mensaje enviado a Chatwoot');
  } catch (err) {
    console.error(':x: Error enviando mensaje:', err.response?.data || err.message);
  }
}

// Webhook para recibir mensajes de WhatsApp (360dialog)
app.post('/webhook', async (req, res) => {
  const data = req.body;
  try {
    const entry = data.entry?.[0];
    const changes = entry?.changes?.[0]?.value;

    // Ignorar mensajes que no sean de WhatsApp
    const messagingProduct = changes?.messages?.[0]?.messaging_product;
    if (messagingProduct && messagingProduct !== 'whatsapp') {
      console.log('⚠️ Ignorado mensaje no proveniente de WhatsApp');
      return res.sendStatus(200);
    }

    const phone = changes?.contacts?.[0]?.wa_id;
    const name = changes?.contacts?.[0]?.profile?.name;
    const message = changes?.messages?.[0]?.text?.body;

    if (!phone || !message) {
      console.log(':warning: Mensaje ignorado (sin número o texto)');
      return res.sendStatus(200);
    }

    console.log(`:inbox_tray: Nuevo mensaje de ${phone}: ${message}`);
    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await linkContactToInbox(contact.id, phone);
    const conversationId = await getOrCreateConversation(contact.id, contact.identifier);
    if (!conversationId) return res.sendStatus(500);

    await sendMessage(conversationId, message);
    res.sendStatus(200);
  } catch (err) {
    console.error(':x: Error en webhook:', err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`:rocket: Webhook corriendo en puerto ${PORT}`);
});
