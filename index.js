const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Configuración Chatwoot
const CHATWOOT_API_URL = 'https://app.chatwoot.com';
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_IDENTIFIER = 'XFTBmRpV8Tkeok139Y4haZ0o';

app.get('/', (_, res) => {
  res.send('✅ Webhook activo desde Render');
});

app.post('/webhook', async (req, res) => {
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages) return res.sendStatus(200);

    const msg = value.messages[0];
    const contact = value.contacts[0];
    const phoneNumber = `+${contact.wa_id}`;
    const name = contact.profile?.name || 'Sin nombre';
    const identifier = contact.wa_id;
    const text = msg.text?.body || 'Mensaje vacío';

    // Paso 1: Buscar contacto
    const searchResp = await axios.get(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`,
      { headers: { api_access_token: CHATWOOT_API_TOKEN } }
    );

    let contactId, inboxId;

    if (searchResp.data.payload?.[0]) {
      const found = searchResp.data.payload[0];
      contactId = found.id;
      inboxId = found.contact_inboxes?.[0]?.inbox_id;
    } else {
      // Paso 1b: Crear contacto
      const newContactResp = await axios.post(
        `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
        {
          inbox_identifier: CHATWOOT_INBOX_IDENTIFIER,
          name,
          identifier,
          phone_number: phoneNumber
        },
        { headers: { api_access_token: CHATWOOT_API_TOKEN } }
      );

      contactId = newContactResp.data.payload.contact.id;
      inboxId = newContactResp.data.payload.contact_inbox.inbox_id;
    }

    // Paso 2: Crear conversación (o reutilizar si ya existe)
    const convoResp = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      {
        source_id: identifier,
        inbox_id: inboxId,
        contact_id: contactId
      },
      { headers: { api_access_token: CHATWOOT_API_TOKEN } }
    );

    const conversationId = convoResp.data.id;

    // Paso 3: Enviar mensaje entrante
    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: text,
        message_type: 'incoming',
        private: false
      },
      { headers: { api_access_token: CHATWOOT_API_TOKEN } }
    );

    console.log('✅ Mensaje enviado a Chatwoot:', text);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error al enviar a Chatwoot:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
