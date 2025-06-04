const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const ACCOUNT_ID = 122053;
const INBOX_IDENTIFIER = 'FmIi9sWlyf5uafK6dmzoj84Qh'; // Este es el identificador de tu inbox "CHEP Tarimas Azules"

app.post('/webhook', async (req, res) => {
  console.log('📩 Mensaje recibido:', JSON.stringify(req.body, null, 2));

  try {
    const message = req.body?.messages?.[0];
    const contact = req.body?.contacts?.[0];

    if (message && contact) {
      const name = contact.profile.name;
      const phone = contact.wa_id;
      const content = message.text?.body || '[Mensaje no textual]';

      // Enviar a Chatwoot
      await axios.post(`https://app.chatwoot.com/public/api/v1/inboxes/${INBOX_IDENTIFIER}/contacts/whatsapp/notify`, {
        contact: {
          name: name,
          phone_number: phone
        },
        message: {
          content: content
        }
      }, {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN
        }
      });

      console.log(`✅ Enviado a Chatwoot: ${phone}`);
    }

  } catch (error) {
    console.error('❌ Error al enviar a Chatwoot:', error.message);
  }

  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('✅ Webhook activo desde Render');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
