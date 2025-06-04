const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Configuración de Chatwoot
const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '65391';
const CHATWOOT_INBOX_IDENTIFIER = 'XFTBmRpV8Tkeok139YAhaZoo';

const CHATWOOT_API_URL = `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${CHATWOOT_INBOX_IDENTIFIER}/contacts`;

// Utilidad para crear contacto o recuperar ID si ya existe
async function findOrCreateContact(phone, name) {
  const payload = {
    identifier: phone,
    name: name || 'Cliente WhatsApp',
    phone_number: `+${phone}`
  };

  try {
    const response = await axios.post(CHATWOOT_API_URL, payload, {
      headers: {
        api_access_token: CHATWOOT_API_TOKEN
      }
    });
    return response.data.source_id;
  } catch (error) {
    if (error.response?.data?.message?.includes('has already been taken')) {
      console.log('📌 Contacto ya existe:', phone);
      return phone;
    }
    console.error('❌ Error creando contacto:', error.response?.data || error.message);
    return null;
  }
}

// Enviar mensaje a Chatwoot
async function sendToChatwoot(contactId, message) {
  try {
    await axios.post(
      `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`,
      {
        source_id: contactId,
        inbox_id: CHATWOOT_INBOX_ID
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN
        }
      }
    );

    await axios.post(
      `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${contactId}/messages`,
      {
        content: message,
        message_type: 'incoming'
      },
      {
        headers: {
          api_access_token: CHATWOOT_API_TOKEN
        }
      }
    );
    console.log('📩 Mensaje enviado a Chatwoot');
  } catch (err) {
    console.error('❌ Error enviando mensaje:', err.response?.data || err.message);
  }
}

// Webhook para mensajes entrantes de WhatsApp
app.post('/webhook', async (req, res) => {
  const entry = req.body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  const contact = value?.contacts?.[0];
  const message = value?.messages?.[0];

  if (contact && message?.text?.body) {
    const phone = contact.wa_id;
    const name = contact.profile?.name;
    const text = message.text.body;

    console.log('📥 Mensaje recibido:', text);

    const contactId = await findOrCreateContact(phone, name);
    if (contactId) {
      await sendToChatwoot(contactId, text);
    }
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
