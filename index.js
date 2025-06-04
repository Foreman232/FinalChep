const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_URL = 'https://app.chatwoot.com';
const API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const ACCOUNT_ID = '122053';
const INBOX_ID = '65391';

app.post('/webhook', async (req, res) => {
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const contact = value?.contacts?.[0];
    const message = value?.messages?.[0];

    if (!contact || !message) return res.sendStatus(400);

    const waId = contact.wa_id;
    const phone = `+${waId}`;
    const name = contact.profile?.name || 'Cliente WhatsApp';
    const text = message.text?.body || '[Sin texto]';

    // 1. Buscar contacto
    const contactResp = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${waId}`,
      { headers: { api_access_token: API_TOKEN } }
    );

    let contactId;
    if (contactResp.data.payload.length > 0) {
      contactId = contactResp.data.payload[0].id;
      console.log('🔁 Contacto ya existe:', contactId);
    } else {
      const createResp = await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
        {
          inbox_id: INBOX_ID,
          name,
          phone_number: phone,
          identifier: waId
        },
        { headers: { api_access_token: API_TOKEN } }
      );
      contactId = createResp.data.payload.contact.id;
      console.log('🆕 Contacto creado:', contactId);
    }

    // 2. Buscar conversación existente
    let conversationId;
    try {
      const convoSearch = await axios.get(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        {
          headers: { api_access_token: API_TOKEN },
          params: { inbox_id: INBOX_ID, contact_id: contactId }
        }
      );
      if (convoSearch.data.payload.length > 0) {
        conversationId = convoSearch.data.payload[0].id;
        console.log('🔁 Conversación ya existe:', conversationId);
      }
    } catch (err) {
      console.warn('⚠️ No se encontró conversación previa');
    }

    // 3. Crear conversación si no existe
    if (!conversationId) {
      const convoCreate = await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
        {
          source_id: waId,
          inbox_id: INBOX_ID,
          contact_id: contactId
        },
        { headers: { api_access_token: API_TOKEN } }
      );
      conversationId = convoCreate.data.id;
      console.log('🆕 Conversación creada:', conversationId);
    }

    // 4. Enviar mensaje entrante
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: text,
        message_type: 'incoming',
        private: false
      },
      { headers: { api_access_token: API_TOKEN } }
    );

    console.log('✅ Mensaje enviado a Chatwoot');
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error final:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('✅ Webhook activo');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
