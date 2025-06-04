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
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const contact = value?.contacts?.[0];
    const message = value?.messages?.[0];

    if (!contact || !message) return res.sendStatus(200);

    const phone = message.from;
    const name = contact.profile?.name || 'Cliente';
    const content = message.text?.body || '(mensaje no reconocido)';

    // Crear contacto
    const contactResp = await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`, {
      inbox_id: CHATWOOT_INBOX_ID,
      name,
      identifier: phone
    }, {
      headers: { api_access_token: CHATWOOT_API_KEY }
    });

    const contactId = contactResp.data.id;

    // Crear conversación
    const convResp = await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
      source_id: phone,
      inbox_id: CHATWOOT_INBOX_ID,
      contact_id: contactId
    }, {
      headers: { api_access_token: CHATWOOT_API_KEY }
    });

    const conversationId = convResp.data.id;

    // Enviar mensaje entrante
    await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_KEY }
    });

    console.log(`✅ Mensaje de ${name} recibido y enviado a Chatwoot`);
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error enviando a Chatwoot:', error.response?.data || error.message);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => res.send('✅ Webhook activo desde Render'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
