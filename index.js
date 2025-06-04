const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_URL = 'https://app.chatwoot.com';
const CHATWOOT_ACCOUNT_ID = 122053;
const CHATWOOT_INBOX_ID = 65391;
const CHATWOOT_API_KEY = '8JE48bwAMsyvEihSvjHy6Ag6';

app.post('/webhook', async (req, res) => {
  const entry = req.body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const contacts = value?.contacts?.[0];
  const messages = value?.messages?.[0];

  if (!messages || !contacts) return res.sendStatus(200);

  const from = messages.from;
  const name = contacts.profile?.name || 'Cliente';
  const text = messages.text?.body || '(mensaje no reconocido)';

  try {
    // 1. Buscar si ya existe el contacto
    const searchResp = await axios.get(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${from}`, {
      headers: { api_access_token: CHATWOOT_API_KEY }
    });

    let contactId;

    if (searchResp.data.payload.length > 0) {
      contactId = searchResp.data.payload[0].id;
    } else {
      // 2. Si no existe, crear el contacto
      const contactResp = await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`, {
        inbox_id: CHATWOOT_INBOX_ID,
        name,
        identifier: from
      }, {
        headers: { api_access_token: CHATWOOT_API_KEY }
      });
      contactId = contactResp.data.id;
    }

    // 3. Crear conversación si no existe
    const convResp = await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      source_id: from,
      inbox_id: CHATWOOT_INBOX_ID,
      contact_id: contactId
    }, {
      headers: { api_access_token: CHATWOOT_API_KEY }
    });

    const conversationId = convResp.data.id;

    // 4. Enviar mensaje entrante
    await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: text,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_KEY }
    });

    console.log('✅ Mensaje enviado a Chatwoot');
  } catch (err) {
    console.error('❌ Error enviando a Chatwoot:', err.response?.data || err.message);
  }

  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('✅ Webhook activo desde Render'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
