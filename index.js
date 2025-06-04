const axios = require('axios');

const BASE_URL = 'https://app.chatwoot.com/public/api/v1/accounts/122053';
const TOKEN = '8JE48bwAMsyvEihSvjHy6Ag6';

async function crearContacto() {
  try {
    const response = await axios.post(`${BASE_URL}/contacts`, {
      identifier: '50254152068',
      name: 'Axel Sambrano',
      phone_number: '+50254152068'
    }, {
      headers: {
        api_access_token: TOKEN
      }
    });

    console.log('✅ Contacto creado:', response.data);
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  }
}

crearContacto();
