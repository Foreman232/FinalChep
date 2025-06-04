const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';

const CONTACT_API = `https://app.chatwoot.com/public/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts`;

async function findOrCreateContact(phone, name = 'Cliente WhatsApp') {
  const payload = {
    identifier: phone,
    name: name || 'Sin Nombre',
    phone_number: `+${phone}`,
    inbox_id: CHATWOOT_INBOX_ID
  };

  try {
    const response = await axios.post(CONTACT_API, payload, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('✅ Contacto creado:', response.data.payload.identifier);
    return response.data.payload;
  } catch (err) {
    const msg = err.response?.data?.message || JSON.stringify(err.response?.data);
    if (msg.includes('has already been taken')) {
      console.log('ℹ️ Contacto ya existe:', phone);
      return { identifier: phone };
    }
    console.error('❌ Error creando contacto:', msg);
    return null;
  }
}

async function sendMessage(contact, message) {
  try {
    const response = await axios.post(`https://app.chatwoot.com/public/api/v1/inboxes/${CHATWOOT_INBOX_ID}/contacts/${contact.identifier}/messages`, {
      content: message,
      message_type: 'incoming'
    }, {
      headers: { api_access_token: CHATWOOT_API_TOKEN }
    });
    console.log('📨 Mensaje enviado a Chatwoot');
  } catch (err) {
    console.error('❌ Error enviando mensaje:', err.response?.data || err.message);
  }
}

app.post('/webhook', async (req, res) => {
  const data = req.body;
  try {
    const entry = data.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const phone = changes?.contacts?.[0]?.wa_id;
    const name = changes?.contacts?.[0]?.profile?.name;
    const message = changes?.messages?.[0]?.text?.body;

    if (!phone || !message) {
      console.log('⚠️ Mensaje ignorado (sin número o texto)');
      return res.sendStatus(200);
    }

    console.log(`📥 Nuevo mensaje de ${phone}: ${message}`);

    const contact = await findOrCreateContact(phone, name);
    if (!contact) return res.sendStatus(500);

    await sendMessage(contact, message);

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error en webhook:', err.message);
    res.sendStatus(500);
  }
});

const PORT = 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
