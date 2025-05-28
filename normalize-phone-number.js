/**
 * 📞 HubSpot Phone Number Normalizer (with Retry & Rate Limit Handling)
 *
 * This script is used as a HubSpot custom code action within a contact-based workflow.
 * It normalizes the following phone fields into E.164 format (+1XXXXXXXXXX for U.S.):
 *   - phone
 *   - mobilephone
 *   - hq_phone_number
 *   - alt_phone_number
 *
 * It handles HubSpot API rate limits by retrying 429 responses with exponential backoff.
 *
 * Prerequisites:
 * - HubSpot Private App token with `crm.objects.contacts.read` and `crm.objects.contacts.write`
 * - Set `secretName` as the access token secret in your custom code action
 */

const hubspot = require('@hubspot/api-client');

// 📋 Phone fields to normalize
const PHONE_FIELDS = [
  'phone',
  'mobilephone',
  'hq_phone_number',
  'alt_phone_number'
];

exports.main = async (event, callback) => {
  const contactId = event.object.objectId;
  const hubspotClient = new hubspot.Client({ accessToken: process.env.secretName });

  try {
    console.log(`📞 Starting phone normalization for contact: ${contactId}`);

    // 🔍 Fetch the contact's phone fields
    const contactResponse = await hubspotClient.crm.contacts.basicApi.getById(contactId, PHONE_FIELDS);

    if (!contactResponse || !contactResponse.properties) {
      console.error('❌ Invalid contact response structure:', JSON.stringify(contactResponse, null, 2));
      return callback({ error: 'Contact data is missing or malformed' });
    }

    const updatedProps = {};

    // 🔁 Normalize each phone field
    for (const field of PHONE_FIELDS) {
      const rawValue = contactResponse.properties[field];
      if (!rawValue) {
        console.log(`⚠️ No value found for ${field}. Skipping.`);
        continue;
      }

      const normalized = normalizePhoneNumber(rawValue);

      if (!normalized) {
        console.log(`⚠️ Unable to normalize ${field}: ${rawValue}`);
        continue;
      }

      if (normalized !== rawValue) {
        updatedProps[field] = normalized;
        console.log(`✅ Normalized ${field}: ${rawValue} → ${normalized}`);
      } else {
        console.log(`ℹ️ ${field} already normalized: ${rawValue}`);
      }
    }

    // 💾 Update only if there are changes
    if (Object.keys(updatedProps).length > 0) {
      await safeUpdateContact(hubspotClient, contactId, updatedProps);
      console.log(`🔄 Updated contact ${contactId} with normalized values.`);
    } else {
      console.log('🛑 No updates needed. All phone fields are clean or invalid.');
    }

    callback({ outputFields: updatedProps });

  } catch (error) {
    console.error('❌ Normalization failed:', error.message);
    callback({ error: error.message });
  }
};

/**
 * 🔧 Normalize a phone number to E.164 (+1XXXXXXXXXX)
 */
function normalizePhoneNumber(input) {
  const cleaned = input.replace(/\D/g, '').trim();
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  return null;
}

/**
 * 🔁 Update contact with retry logic on 429 rate limit
 */
async function safeUpdateContact(client, contactId, properties, retries = 3, delayMs = 1000) {
  try {
    await client.crm.contacts.basicApi.update(contactId, { properties });
  } catch (err) {
    if (err.statusCode === 429 && retries > 0) {
      console.warn(`⚠️ Rate limited. Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return safeUpdateContact(client, contactId, properties, retries - 1, delayMs * 2);
    } else {
      throw err;
    }
  }
}
