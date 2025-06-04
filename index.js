const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Chatwoot config
const CHATWOOT_URL = "https://app.chatwoot.com";
const ACCOUNT_ID = "122053";
const INBOX_ID = 66314;
const API_TOKEN = "8JE48bwAMsyvEihSvjHy6Ag6";

const HEADERS = {
  "Content-Type": "application/json",
  "api_access_token": API_TOKEN
};

// Función para obtener o crear contacto
async function getOrCreateContact(wa_id, name) {
  try {
    const phone = `+${wa_id}`;

    // Buscar contacto
    const searchRes = await axios.get(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${phone}`, { headers: HEADERS });
    const existing = searchRes.data.payload[0];
    if (existing) {
      console.log("📇 Contacto existente:", phone);
      return existing.id;
    }

    // Crear contacto nuevo
    const createRes = await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
      inbox_id: INBOX_ID,
      name,
      phone_number: phone
    }, { headers: HEADERS });

    const contactId = createRes.data.payload.contact.id;
    console.log("✅ Contacto creado:", contactId);
    return contactId;

  } catch (error) {
    console.error("❌ Error en contacto:", error.response?.data || error.message);
    throw error;
  }
}

// Función para crear conversación
async function createConversation(contactId) {
  try {
    const convRes = await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations`, {
      source_id: contactId,
      inbox_id: INBOX_ID
    }, { headers: HEADERS });

    return convRes.data.id;
  } catch (error) {
    console.error("❌ Error creando conversación:", error.response?.data || error.message);
    throw error;
  }
}

// Enviar mensaje entrante
async function sendMessage(conversationId, text) {
  try {
    await axios.post(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: text,
      message_type: "incoming"
    }, { headers: HEADERS });
    console.log("💬 Mensaje enviado a conversación:", text);
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error.response?.data || error.message);
  }
}

// Webhook de WhatsApp
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (!change?.messages || !change.contacts) return res.sendStatus(200);

    const contact = change.contacts[0];
    const message = change.messages[0];

    const wa_id = contact.wa_id;
    const name = contact.profile?.name || "Usuario WhatsApp";
    const text = message?.text?.body || "Mensaje sin texto";

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
  res.send("✅ Webhook activo.");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
