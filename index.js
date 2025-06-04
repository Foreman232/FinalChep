const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_URL = 'https://app.chatwoot.com';
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '65391'; // ID de bandeja "CHEP Tarimas Azules"

app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    console.log('📥 Mensaje recibido:', JSON.stringify(data, null, 2));

    const contact = data.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!contact || !message) {
      console.log('⚠️ No se encontró contacto o mensaje válido.');
      return res.sendStatus(400);
    }

    const phoneNumber = contact.wa_id;
    const name = contact.profile?.name || 'Desconocido';
    const text = message.text?.body || '[Mensaje vacío]';

    // 1. Buscar o crear contacto
    const contactPayload = {
      inbox_id: CHATWOOT_INBOX_ID,
      name,
      phone_number: `+${phoneNumber}`,
    };

    const contactResp = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
      contactPayload,
      { headers: { api_access_token: CHATWOOT_API_TOKEN } }
    );

    const contactId = contactResp.data.payload.contact.id;

    // 2. Crear conversación (si no existe)
    const convoResp = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      {
        source_id: phoneNumber, // Clave para que no duplique
        inbox_id: CHATWOOT_INBOX_ID,
        contact_id: contactId,
      },
      { headers: { api_access_token: CHATWOOT_API_TOKEN } }
    );

    const conversationId = convoResp.data.id;

    // 3. Enviar mensaje como entrante
    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: text,
        message_type: 'incoming',
        private: false,
      },
      { headers: { api_access_token: CHATWOOT_API_TOKEN } }
    );

    console.log('✅ Mensaje enviado a Chatwoot:', text);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error procesando mensaje:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('✅ Webhook activo desde Render');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
