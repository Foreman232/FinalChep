const axios = require('axios');

const CHATWOOT_API_URL = 'https://app.chatwoot.com'; // o tu URL de Chatwoot si es self-hosted
const CHATWOOT_ACCOUNT_ID = '122053'; // tu ID de cuenta en Chatwoot
const CHATWOOT_INBOX_ID = '65391';    // tu inbox ID (Chep WhatsApp)
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6'; // tu token de API
const CHATWOOT_IDENTIFIER = 'FmIi9sWlyf5uafK6dmzoj84Qh'; // identificador del inbox

// Reenvía mensaje a Chatwoot
const data = req.body;
const from = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;

if (from && message) {
  await axios.post(`${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`, {
    source_id: from,
    inbox_id: CHATWOOT_INBOX_ID,
    contact: {
      name: 'Usuario WhatsApp'
    },
    messages: [{
      content: message
    }]
  }, {
    headers: {
      api_access_token: CHATWOOT_API_TOKEN
    }
  });
}
