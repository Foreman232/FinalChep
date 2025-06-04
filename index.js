const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_URL = 'https://app.chatwoot.com';
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const ACCOUNT_ID = '122053';
const INBOX_ID = '65391';

app.post('/webhook', async (req, res) => {
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const contact = value?.contacts?.[0];
    const message = value?.messages?.[0];

    if (!contact || !message) {
      console.log('⚠️ Información incompleta.');
      return res.sendStatus(400);
    }

    const waId = contact.wa_id;
    const phone = `+${waId}`;
    const name = contact.profile?.name || 'Cliente WhatsApp';
    const text = message.text?.body || '[Sin contenido]';

    // Paso 1: Buscar contacto
    const lookupResp = await axios.get(`${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${waId}`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });

    let contactId;

    if (lookupResp.data.payload.length > 0) {
      contactId = lookupResp.data.payload[0].id;
      console.log(`🔁 Contacto existente ID: ${contactId}`);
    } else {
      const createResp = await axios.post(
        `${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
        {
          inbox_id: INBOX_ID,
          name,
          phone_number: phone,
          identifier: waId
        },
        { headers: { api_access_token: CHATWOOT_API_TOKEN } }
      );
      contactId = createResp.data.payload.contact.id;
      console.log(`🆕 Contacto creado ID: ${contactId}`);
    }

    // Paso 2 y 3: Crear conversación con source_id (wa_id)
    const convoResp = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
      {
        source_id: waId,
        inbox_id: INBOX_ID,
        contact_id: contactId
      },
      { headers: { api_access_token: CHATWOOT_API_TOKEN } }
    );

    const conversationId = convoResp.data.id;

    // Paso 4: Enviar mensaje como entrante
    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: text,
        message_type: 'incoming',
        private: false
      },
      { headers: { api_access_token: CHATWOOT_API_TOKEN } }
    );

    console.log('✅ Mensaje reenviado a Chatwoot.');
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
