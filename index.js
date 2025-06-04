const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Configuración de Chatwoot
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

    if (!body?.entry?.[0]?.changes?.[0]?.value?.messages) {
      return res.sendStatus(200);
    }

    const value = body.entry[0].changes[0].value;
    const message = value.messages[0];
    const contact = value.contacts[0];

    const identifier = contact.wa_id;
    const phone = `+${identifier}`;
    const name = contact.profile?.name || 'Sin nombre';
    const text = message.text?.body || 'Mensaje vacío';

    // Paso 1: Buscar o crear contacto
    const searchResp = await axios.get(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`,
      {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      }
    );

    let contactId, inboxId;
    const found = searchResp.data.payload?.[0];

    if (found) {
      contactId = found.id;
      inboxId = found.contact_inboxes?.[0]?.inbox_id;
    } else {
      const contactResp = await axios.post(
        `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
        {
          inbox_identifier: CHATWOOT_INBOX_IDENTIFIER,
          name,
          identifier,
          phone_number: phone
        },
        {
          headers: { api_access_token: CHATWOOT_API_TOKEN }
        }
      );

      contactId = contactResp.data.payload.contact.id;
      inboxId = contactResp.data.payload.contact_inbox.inbox_id;
    }

    // Paso 2: Buscar o crear conversación
    const convoResp = await axios.post(
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

    const conversationId = convoResp.data.id;

    // Paso 3: Enviar mensaje entrante a la conversación
    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
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
