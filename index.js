const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// CONFIGURACIÓN
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
const BASE_URL = 'https://app.chatwoot.com/api/v1/accounts';

// Buscar o crear contacto
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

// Enviar mensaje entrante a Chatwoot
async function sendIncomingMessage(sourceId, message) {
  try {
    await axios.post(`https://app.chatwoot.com/api/v1/inboxes/${CHATWOOT_INBOX_ID}/messages`, {
      source_id: sourceId,
      content: message,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('📨 Mensaje recibido registrado en Chatwoot');
  } catch (err) {
    console.error('❌ Error enviando mensaje:', err.response?.data || err.message);
  }
}

// Webhook de entrada desde 360dialog
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

    console.log(`📥 Nuevo mensaje de ${phone}: ${message}`);

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await sendIncomingMessage(contact.identifier, message);

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error en webhook:', err.message);
    res.sendStatus(500);
  }
});

// Iniciar servidor
const PORT = 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
