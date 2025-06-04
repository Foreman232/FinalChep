const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_URL = 'https://app.chatwoot.com'; // No lo cambies
const CHATWOOT_ACCOUNT_ID = 122053;
const CHATWOOT_INBOX_ID = 65391;
const CHATWOOT_API_KEY = '8JE48bwAMsyvEihSvjHy6Ag6'; // Tu token real

app.post('/webhook', async (req, res) => {
  console.log('📩 Mensaje recibido de 360dialog:', JSON.stringify(req.body, null, 2));

  const entry = req.body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const contacts = value?.contacts?.[0];
  const messages = value?.messages?.[0];

  if (!messages || !contacts) {
    return res.sendStatus(200); // No es un mensaje válido
  }

  const from = messages.from; // número del cliente
  const name = contacts.profile?.name || 'Cliente';
  const text = messages.text?.body || '(Mensaje no soportado)';

  try {
    // Crear contacto
    await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`, {
      inbox_id: CHATWOOT_INBOX_ID,
      name,
      identifier: from
    }, {
      headers: { api_access_token: CHATWOOT_API_KEY }
    });

    // Enviar mensaje entrante
    await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/messages`, {
      content: text,
      inbox_id: CHATWOOT_INBOX_ID,
      contact_identifier: from,
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

app.get('/', (req, res) => {
  res.send('✅ Webhook activo y corriendo');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
