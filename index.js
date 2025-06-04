const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_URL = 'https://app.chatwoot.com'; // No le pongas slash final
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_IDENTIFIER = 'XFTBmRp8TKeokj39Y4haZoo';

app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const messageData = payload?.entry?.[0]?.changes?.[0]?.value;

    const phone_number_id = messageData?.metadata?.phone_number_id;
    const from = messageData?.messages?.[0]?.from;
    const msg_body = messageData?.messages?.[0]?.text?.body;
    const name = messageData?.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';

    if (!from || !msg_body) {
      console.log('❌ No se pudo procesar el mensaje.');
      return res.sendStatus(400);
    }

    console.log(`📥 Mensaje recibido de ${from}: ${msg_body}`);

    // Paso 1: Crear o recuperar contacto en Chatwoot
    const contactResponse = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`,
      {
        inbox_identifier: CHATWOOT_INBOX_IDENTIFIER,
        name: name,
        identifier: from,
        phone_number: `+${from}` // ¡E.164 con el "+"!
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN
        }
      }
    );

    const contactId = contactResponse.data.payload.contact.id;

    // Paso 2: Crear conversación si no existe
    const conversationResponse = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      {
        source_id: from,
        inbox_id: contactResponse.data.payload.contact_inbox.inbox_id,
        contact_id: contactId
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN
        }
      }
    );

    const conversationId = conversationResponse.data.id;

    // Paso 3: Enviar mensaje entrante a Chatwoot
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

    console.log('✅ Mensaje enviado a Chatwoot correctamente.');

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
