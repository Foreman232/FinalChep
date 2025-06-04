const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_URL = 'https://app.chatwoot.com/api/v1';
const ACCOUNT_ID = '122053';
const CHATWOOT_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const INBOX_IDENTIFIER = 'XFTBmRpV8Tkeok139YAhaZoo';

app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!payload?.messages || !payload?.contacts) return res.sendStatus(200);

    const contact = payload.contacts[0];
    const message = payload.messages[0];

    const phone = contact.wa_id;
    const name = contact.profile?.name || 'Usuario WhatsApp';
    const text = message.text?.body || 'Mensaje vacío';

    console.log("📨 Mensaje recibido:", text);

    // Paso 1: Crear contacto (o encontrarlo si ya existe)
    const contactResponse = await axios.post(
      `${CHATWOOT_API_URL}/accounts/${ACCOUNT_ID}/contacts`,
      {
        inbox_id: INBOX_IDENTIFIER,
        name: name,
        phone_number: `+${phone}`, // ✅ Formato E.164
      },
      {
        headers: {
          api_access_token: CHATWOOT_TOKEN,
        },
      }
    );

    const contactId = contactResponse.data.payload.contact.id;
    console.log("✅ Contacto ID:", contactId);

    // Paso 2: Crear conversación
    const conversationResponse = await axios.post(
      `${CHATWOOT_API_URL}/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`,
      {},
      {
        headers: {
          api_access_token: CHATWOOT_TOKEN,
        },
      }
    );

    const conversationId = conversationResponse.data.id;
    console.log("✅ Conversación ID:", conversationId);

    // Paso 3: Enviar mensaje
    await axios.post(
      `${CHATWOOT_API_URL}/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: text,
        message_type: 'incoming',
      },
      {
        headers: {
          api_access_token: CHATWOOT_TOKEN,
        },
      }
    );

    console.log('✅ Mensaje enviado a Chatwoot');
    res.sendStatus(200);

  } catch (error) {
    const errMsg = error.response?.data || error.message;
    console.error('❌ Error procesando mensaje:', errMsg);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('✅ Webhook activo desde Render');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
