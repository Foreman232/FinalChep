const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// CONFIGURACIÓN CHATWOOT
const CHATWOOT_API_URL = 'https://app.chatwoot.com';
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_IDENTIFIER = 'XFTBmRpV8Tkeok139Y4haZ0o';

app.get('/', (_, res) => {
  res.send('✅ Webhook activo desde Render');
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Validación básica
    if (!body || !body.entry || !body.entry[0].changes[0].value.messages) {
      return res.sendStatus(200); // ignorar si no es mensaje válido
    }

    const messageData = body.entry[0].changes[0].value;
    const msg = messageData.messages[0];
    const contact = messageData.contacts[0];

    const phone = `+${contact.wa_id}`;
    const name = contact.profile?.name || 'Sin nombre';
    const text = msg.text?.body || 'Mensaje vacío';
    const identifier = contact.wa_id;

    // Paso 1: buscar contacto
    let contactId, inboxId;

    const searchUrl = `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`;
    const searchResp = await axios.get(searchUrl, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });

    const found = searchResp.data.payload?.[0];
    if (found) {
      contactId = found.id;
      inboxId = found.contact_inboxes?.[0]?.inbox_id;
    } else {
      // Paso 2: crear contacto
      const createResp = await axios.post(
        `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
        {
          inbox_identifier: CHATWOOT_INBOX_IDENTIFIER,
          name: name,
          identifier: identifier,
          phone_number: phone
        },
        {
          headers: { api_access_token: CHATWOOT_API_TOKEN }
        }
      );
      contactId = createResp.data.payload.contact.id;
      inboxId = createResp.data.payload.contact_inbox.inbox_id;
    }

    // Paso 3: enviar mensaje entrante a Chatwoot
    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      {
        source_id: identifier,
        inbox_id: inboxId,
        contact_id: contactId
      },
      {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      }
    );

    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${contactId}/messages`,
      {
        content: text,
        message_type: 'incoming',
        private: false
      },
      {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      }
    );

    console.log('📩 Mensaje reenviado a Chatwoot:', text);
    res.sendStatus(200);

  } catch (error) {
    console.error('❌ Error procesando mensaje:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
