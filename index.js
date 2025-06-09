const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_API_TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';
const CHATWOOT_ACCOUNT_ID = '122053';
const CHATWOOT_INBOX_ID = '66314';
const BASE_URL = 'https://app.chatwoot.com/api/v1/accounts';
const DIALOG360_API_KEY = 'icCVWtPvpn2Eb9c2C5wjfA4NAK';

// 📥 Webhook: entrada desde 360dialog a Chatwoot
app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
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

    const identifier = `+${phone}`;
    const payload = {
      inbox_id: CHATWOOT_INBOX_ID,
      name,
      identifier,
      phone_number: identifier
    };

    // Crear o recuperar contacto
    let contact;
    try {
      const response = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts`, payload, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      contact = response.data.payload;
      console.log('✅ Contacto creado:', contact.id);
    } catch (err) {
      if (err.response?.data?.message?.includes('has already been taken')) {
        const search = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${identifier}`, {
          headers: { api_access_token: CHATWOOT_API_TOKEN }
        });
        contact = search.data.payload[0];
        console.log('ℹ️ Contacto ya existe:', contact?.id);
      } else {
        console.error('❌ Error creando contacto:', err.message);
        return res.sendStatus(500);
      }
    }

    // Vincular al inbox
    try {
      await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contact.id}/contact_inboxes`, {
        inbox_id: CHATWOOT_INBOX_ID,
        source_id: identifier
      }, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
    } catch (err) {
      if (!err.response?.data?.message?.includes('has already been taken')) {
        console.error('❌ Error vinculando al inbox:', err.message);
        return res.sendStatus(500);
      }
    }

    // Obtener o crear conversación
    let conversationId;
    try {
      const resConv = await axios.get(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/contacts/${contact.id}/conversations`, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      if (resConv.data.payload.length > 0) {
        conversationId = resConv.data.payload[0].id;
        console.log('↩️ Conversación existente:', conversationId);
      } else {
        const newConv = await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations`, {
          source_id: identifier,
          inbox_id: CHATWOOT_INBOX_ID
        }, {
          headers: { api_access_token: CHATWOOT_API_TOKEN }
        });
        conversationId = newConv.data.id;
        console.log('🆕 Conversación creada:', conversationId);
      }
    } catch (err) {
      console.error('❌ Error al obtener/crear conversación:', err.message);
      return res.sendStatus(500);
    }

    // Enviar mensaje a Chatwoot
    try {
      await axios.post(`${BASE_URL}/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`, {
        content: message,
        message_type: 'incoming',
        private: false
      }, {
        headers: { api_access_token: CHATWOOT_API_TOKEN }
      });
      console.log('📨 Mensaje enviado a Chatwoot');
    } catch (err) {
      console.error('❌ Error enviando mensaje a Chatwoot:', err.message);
      return res.sendStatus(500);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error general en webhook:', err.message);
    res.sendStatus(500);
  }
});

// 📤 Webhook: salida desde Chatwoot a WhatsApp
app.post('/outbound', async (req, res) => {
  try {
    const event = req.body;

    if (
      event.message_type !== 'outgoing' ||
      event.private ||
      !event.content ||
      !event.conversation ||
      !event.conversation.meta?.sender?.phone_number
    ) {
      console.log('⚠️ Mensaje ignorado en outbound');
      return res.sendStatus(200);
    }

    const phone = event.conversation.meta.sender.phone_number.replace('+', '');
    const message = event.content;

    const send = await axios.post('https://waba-v2.360dialog.io/messages', {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': DIALOG360_API_KEY
      }
    });

    console.log('📤 Mensaje enviado a WhatsApp via 360dialog:', send.data);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error en outbound:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
