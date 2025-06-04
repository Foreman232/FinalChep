const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_URL = 'https://app.chatwoot.com';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_IDENTIFIER = 'XFTBmRpV8Tkeokj39Y4haZoo';
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';

app.post('/webhook', async (req, res) => {
  try {
    console.log('📩 Mensaje recibido:', JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const contact = changes?.value?.contacts?.[0];

    if (!message || !contact) {
      return res.sendStatus(200); // No hay mensaje útil
    }

    const wa_id = contact.wa_id;
    const name = contact.profile.name;
    const content = message.text?.body;

    // Crear contacto en Chatwoot
    const contactResponse = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
      {
        inbox_identifier: CHATWOOT_INBOX_IDENTIFIER,
        name: name,
        identifier: wa_id,
        phone_number: wa_id
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN,
        }
      }
    );

    const contact_id = contactResponse.data.payload.contact.id;

    // Crear mensaje entrante
    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      {
        source_id: wa_id,
        inbox_identifier: CHATWOOT_INBOX_IDENTIFIER,
        contact_id: contact_id
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN,
        }
      }
    );

    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${contact_id}/messages`,
      {
        content: content,
        message_type: 'incoming'
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN,
        }
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error enviando a Chatwoot:', error?.response?.data || error.message);
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
