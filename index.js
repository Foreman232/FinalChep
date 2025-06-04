const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Configuración Chatwoot
const CHATWOOT_API_URL = "https://app.chatwoot.com";
const ACCOUNT_ID = "122053";
const INBOX_ID = "66314";
const API_TOKEN = "8JE48bwAMsyvEihSvjHy6Ag6";

const HEADERS = {
  "Content-Type": "application/json",
  "api_access_token": API_TOKEN
};

// Función para obtener o crear contacto
async function getOrCreateContact(phone, name) {
  try {
    // Buscar si ya existe el contacto
    const search = await axios.get(`${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${phone}`, { headers: HEADERS });
    if (search.data.payload.length > 0) {
      console.log("📌 Contacto existente:", phone);
      return search.data.payload[0].id;
    }

    // Crear contacto nuevo
    const create = await axios.post(`${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
      inbox_id: INBOX_ID,
      name,
      phone_number: `+${phone}`
    }, { headers: HEADERS });

    console.log("✅ Contacto creado:", phone);
    return create.data.payload.contact.id;
  } catch (error) {
    console.error("❌ Error en contacto:", error.response?.data || error.message);
    throw error;
  }
}

// Función para crear conversación
async function createConversation(contactId) {
  try {
    const conv = await axios.post(`${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations`, {
      source_id: contactId.toString(),
      inbox_id: INBOX_ID
    }, { headers: HEADERS });

    return conv.data.id;
  } catch (error) {
    console.error("❌ Error creando conversación:", error.response?.data || error.message);
    throw error;
  }
}

// Función para enviar mensaje entrante
async function sendMessage(conversationId, text) {
  try {
    await axios.post(`${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`, {
      content: text,
      message_type: "incoming"
    }, { headers: HEADERS });
    console.log("💬 Mensaje enviado a Chatwoot:", text);
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error.response?.data || error.message);
  }
}

// Webhook principal
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;

    if (!change || !change.contacts || !change.messages) return res.sendStatus(200);

    const wa_id = change.contacts[0].wa_id;
    const name = change.contacts[0].profile.name;
    const message = change.messages[0];
    const text = message?.text?.body;

    if (!text) return res.sendStatus(200);

    const contactId = await getOrCreateContact(wa_id, name);
    const conversationId = await createConversation(contactId);
    await sendMessage(conversationId, text);

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error procesando mensaje:", error.message);
    res.sendStatus(500);
  }
});

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send("✅ Webhook activo y listo.");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook corriendo en puerto ${PORT}`);
});
