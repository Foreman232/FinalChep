const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_URL = 'https://app.chatwoot.com';
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_IDENTIFIER = 'XFTBmRp8TKeokj39Y4haZoo';

app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const messageData = payload?.entry?.[0]?.changes?.[0]?.value;

    const from = messageData?.messages?.[0]?.from;
    const msg_body = messageData?.messages?.[0]?.text?.body;
    const name = messageData?.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';

    if (!from || !msg_body) {
      console.log('❌ Datos insuficientes para procesar mensaje.');
      return res.sendStatus(400);
    }

    const identifier = from;
    const phone = `+${from}`;

    console.log(`📥 Mensaje recibido de ${from}: ${msg_body}`);

    // Paso 1: Buscar si ya existe el contacto
    let contactId;
    let inboxId;

    try {
      const searchResponse = await axios.get(
        `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`,
        {
          headers: {
            api_access_token: CHATWOOT_API_TOKEN
          }
        }
      );

      const existingContact = searchResponse.data.payload?.[0];
      if (existingContact) {
        contactId = existingContact.id;
        inboxId = existingContact.contact_inboxes?.[0]?.inbox_id;
      }
    } catch (e) {
      console.log('🔍 No se encontró contacto, se creará uno nuevo...');
    }

    // Paso 2: Si no existe, crear contacto
    if (!contactId || !inboxId) {
      const createResponse = await axios.post(
        `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
        {
          inbox_identifier: CHATWOOT_INBOX_IDENTIFIER,
          name: name,
          identifier: identifier,
          phone_number: phone
        },
        {
          headers: {
            api_access_token: CHATWOOT_API_TOKEN
          }
        }
      );
      contactId = createResponse.data.payload.contact.id;
      inboxId = createResponse.data.payload.contact_inbox.inbox_id;
    }

    // Paso 3: Crear conversación si no existe
    const conversationResponse = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      {
        source_id: identifier,
        inbox_id: inboxId,
        contact_id: contactId
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN
        }
      }
    );

    const conversationId = conversationResponse.data.id;

    // Paso 4: Enviar el mensaje entrante
    await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: msg_body,
        message_type: 'incoming',
        private: false
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN
        }
      }
    );

    console.log('✅ Mensaje enviado correctamente a Chatwoot.');
    res.sendStatus(200);

  } catch (error) {
    console.error('❌ Error al enviar a Chatwoot:', error?.response?.data || error.message);
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
