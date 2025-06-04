const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const CHATWOOT_URL = "https://app.chatwoot.com";
const ACCOUNT_ID = "122053";
const INBOX_ID = 66314;
const API_TOKEN = "8JE48bwAMsyvEihSvjHy6Ag6";

const HEADERS = {
  "Content-Type": "application/json",
  "api_access_token": API_TOKEN
};

async function getOrCreateContact(wa_id, name) {
  const phone = `+${wa_id}`;
  try {
    const search = await axios.get(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${phone}`, { headers: HEADERS });
    const found = search.data.payload[0];
    if (found) {
      console.log("📇 Contacto existente:", phone);
      return found.id;
    }

    const create = await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
      inbox_id: INBOX_ID,
      name,
      phone_number: phone
    }, { headers: HEADERS });

    return create.data.payload.contact.id;

  } catch (error) {
    console.error("❌ Error creando contacto:", error.response?.data || error.message);
    throw error;
  }
}

async function createConversation(contactId) {
  try {
    const response = await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`, {
      inbox_id: INBOX_ID
    }, { headers: HEADERS });

    return response.data.id;
  } catch (error) {
    console.error("❌ Error creando conversación:", error.response?.data || error.message);
    throw error;
  }
}

async function sendMessage(conversationId, message) {
  try {
    await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: message,
      message_type: "incoming"
    }, { headers: HEADERS });
    console.log("✅ Mensaje enviado:", message);
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error.response?.data || error.message);
  }
}

app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const value = entry?.changes?.[0]?.value;

    if (!value?.messages || !value?.contacts) return res.sendStatus(200);

    const contact = value.contacts[0];
    const msg = value.messages[0];

    const wa_id = contact.wa_id;
    const name = contact.profile?.name || "WhatsApp User";
    const text = msg.text?.body || "Mensaje sin texto";

    const contactId = await getOrCreateContact(wa_id, name);
    const conversationId = await createConversation(contactId);
    await sendMessage(conversationId, text);

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error procesando mensaje:", error.message);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("✅ Webhook activo y funcionando.");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
