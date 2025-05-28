/* *** 
MIT © Pete Downing

Disclaimer:
The code in this repository is provided “as-is,” without warranty of any kind, express or implied. I make no guarantees of performance, accuracy, or reliability. By using this code, you agree that I am not liable for any damages, data loss, or unintended outcomes resulting from its use in any system, including but not limited to HubSpot. Use at your own risk. Always test in a sandbox or development environment before deploying to production.

 * Smart Contact Deduplication Script for HubSpot Workflows
 *
 * Uses a series of prioritized matching strategies to identify duplicate contacts.
 *
 * Matching Steps:
 * 1. First name + Last name + Phone number
 * 2. First name + Last name + Email address
 * 3. First name + Last name + Email username
 * 4. Exact Email address match
 * 5. Email username + root domain (e.g., "user" + "company")
 * 6. Normalized Email username (ignores dots)
 * 7. First name + Last name + (candidate has no email)
 * 8. First name + Last name + Company name
 *
 * Behavior:
 * - If no matches are found, the workflow ends with no action
 * - If exactly one match is found, the enrolled contact is merged into the surviving contact
 * - If multiple matches are found, the workflow ends without merging
 * - Merge survivor is determined by most recent hs_analytics_last_timestamp
 * - Includes logging, API throttling, and error handling
 */
const hubspot = require('@hubspot/api-client');
const axios = require('axios');

// Normalize HubSpot API call rate with controlled sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main entry point for HubSpot custom code action
exports.main = async (event, callback) => {
  const contactId = event.object.objectId;
  console.log(`🚀 Script started. Processing Contact ID: ${contactId}`);

  // Initialize HubSpot client using token from environment variable
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.HUBSPOTTOKEN
  });

  try {
    // Step 0: Retrieve the full contact record and selected properties
    const contact = await hubspotClient.crm.contacts.basicApi.getById(contactId, [
      'firstname', 'lastname', 'email', 'phone', 'mobilephone',
      'hs_analytics_last_timestamp', 'neverbounce_email_check',
      'hs_email_hard_bounce_reason_enum', 'company'
    ]);
    console.log('📋 Full contact object:', JSON.stringify(contact, null, 2));

    // Normalize and extract key properties
    const props = contact?.properties || {};
    const rawPhone = props.phone;
    const normalizedPhone = rawPhone ? rawPhone.replace(/\D/g, '') : null;
    const firstName = props.firstname?.trim() || '';
    const lastName = props.lastname?.trim() || '';
    const email = props.email?.trim().toLowerCase() || '';
    const emailUsername = email.split('@')[0];
    const domainRoot = (email.split('@')[1] || '').split('.')[0].toLowerCase();
    const normalizeUsername = (s) => s?.toLowerCase().replace(/\./g, '') || '';
    const normalizedInputUsername = normalizeUsername(emailUsername);
    const companyText = props.company?.trim().toLowerCase() || null;

    // Validate required fields before proceeding
    if (!firstName || !lastName) {
      console.log(`⚠️ Missing name, skipping dedupe`);
      await sleep(10000);
      return callback({
        outputFields: {
          status: 'skipped_no_value',
          matchStep: 'none',
          matchesFound: 0,
          reason: 'missing_name'
        }
      });
    }

    // Utility: Perform filtered contact search, excluding the current contact ID
    const getCandidates = async (filters) => {
      const res = await hubspotClient.crm.contacts.searchApi.doSearch({
        filterGroups: [{ filters }],
        properties: ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'hs_analytics_last_timestamp', 'company'],
        limit: 10
      });
      return res.results.filter(c => c.id !== String(contactId));
    };

    let matches = [];
    let matchStep = null;

    // Step 1: Match on First + Last + Phone
    if (normalizedPhone) {
      const results = await getCandidates([
        { propertyName: 'firstname', operator: 'EQ', value: firstName },
        { propertyName: 'lastname', operator: 'EQ', value: lastName }
      ]);
      await sleep(250);
      matches = results.filter(c => {
        const candidatePhone = c.properties?.phone?.replace(/\D/g, '');
        return candidatePhone === normalizedPhone;
      });
      if (matches.length) matchStep = 'name_phone';
    }

    // Step 2: Match on First + Last + Email
    if (matches.length === 0 && email) {
      const results = await getCandidates([
        { propertyName: 'firstname', operator: 'EQ', value: firstName },
        { propertyName: 'lastname', operator: 'EQ', value: lastName },
        { propertyName: 'email', operator: 'EQ', value: email }
      ]);
      await sleep(250);
      matches = results;
      if (matches.length) matchStep = 'name_email';
    }

    // Step 3: Match on First + Last + Email Username
    if (matches.length === 0 && emailUsername) {
      const results = await getCandidates([
        { propertyName: 'firstname', operator: 'EQ', value: firstName },
        { propertyName: 'lastname', operator: 'EQ', value: lastName }
      ]);
      await sleep(250);
      matches = results.filter(c => {
        const candidateUsername = (c.properties?.email || '').split('@')[0].toLowerCase();
        return candidateUsername === emailUsername;
      });
      if (matches.length) matchStep = 'name_email_username';
    }

    // Step 4: Match on Email Only
    if (matches.length === 0 && email) {
      const results = await getCandidates([
        { propertyName: 'email', operator: 'EQ', value: email }
      ]);
      await sleep(250);
      matches = results;
      if (matches.length) matchStep = 'email_only';
    }

    // Step 5: Match on Email Username + Domain Root
    if (matches.length === 0 && emailUsername && domainRoot) {
      const results = await hubspotClient.crm.contacts.searchApi.doSearch({
        query: emailUsername,
        properties: ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company'],
        limit: 10
      });
      await sleep(250);
      matches = results.results.filter(c => {
        const cEmail = c.properties?.email?.toLowerCase() || '';
        const cUsername = cEmail.split('@')[0];
        const cDomainRoot = (cEmail.split('@')[1] || '').split('.')[0];
        return (
          cUsername === emailUsername &&
          cDomainRoot === domainRoot &&
          c.id !== String(contactId)
        );
      });
      if (matches.length) matchStep = 'username_domain_root';
    }

    // Step 6: Match on Normalized Email Username (ignore dots)
    if (matches.length === 0 && normalizedInputUsername) {
      const results = await hubspotClient.crm.contacts.searchApi.doSearch({
        query: normalizedInputUsername,
        properties: ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company'],
        limit: 10
      });
      await sleep(250);
      matches = results.results.filter(c => {
        const cEmail = c.properties?.email?.toLowerCase() || '';
        const cUsername = normalizeUsername(cEmail.split('@')[0]);
        return (
          cUsername === normalizedInputUsername &&
          c.id !== String(contactId)
        );
      });
      if (matches.length) matchStep = 'normalized_username';
    }

    // Step 7: Match on First + Last with Blank Email
    if (matches.length === 0 && firstName && lastName) {
      const results = await getCandidates([
        { propertyName: 'firstname', operator: 'EQ', value: firstName },
        { propertyName: 'lastname', operator: 'EQ', value: lastName }
      ]);
      await sleep(250);
      matches = results.filter(c => {
        const candidateEmail = c.properties?.email;
        return (!candidateEmail || candidateEmail.trim() === '');
      });
      if (matches.length) matchStep = 'name_no_email';
    }

    // Step 8: Match on First + Last + Company
    if (matches.length === 0 && firstName && lastName && companyText) {
      const results = await getCandidates([
        { propertyName: 'firstname', operator: 'EQ', value: firstName },
        { propertyName: 'lastname', operator: 'EQ', value: lastName }
      ]);
      await sleep(250);
      matches = results.filter(c => {
        const candidateCompany = c.properties?.company?.trim().toLowerCase();
        return candidateCompany === companyText;
      });
      if (matches.length) matchStep = 'name_company';
    }

    // Handle no match
    if (matches.length === 0) {
      console.log('✅ No duplicates found');
      await sleep(10000);
      return callback({
        outputFields: {
          status: 'no_match',
          matchStep: 'none',
          matchesFound: 0,
          reason: 'no_matching_contact'
        }
      });
    }

    // Handle ambiguous match
    if (matches.length > 1) {
      console.log(`❌ Ambiguous match: ${matches.length} candidates`);
      await sleep(10000);
      return callback({
        outputFields: {
          status: 'ambiguous',
          matchStep,
          matchesFound: matches.length,
          reason: 'too_many_matches'
        }
      });
    }

    // Sort by last engagement timestamp
    const getTimestamp = (c) =>
      new Date(c.properties?.hs_analytics_last_timestamp || 0).getTime();
    const enrolled = { id: String(contactId), properties: contact.properties };
    const allCandidates = [enrolled, matches[0]];
    const sorted = allCandidates.sort((a, b) => getTimestamp(b) - getTimestamp(a));

    const primaryId = sorted[0].id;
    const mergeTargetId = sorted[1].id;

    if (primaryId === mergeTargetId) {
      console.log(`⚠️ Same contact ID on both sides, skipping`);
      await sleep(10000);
      return callback({
        outputFields: {
          status: 'ambiguous',
          matchStep,
          matchesFound: 1,
          reason: 'same_ids'
        }
      });
    }

    // Perform merge via API
    console.log(`🔗 Merging ${mergeTargetId} into ${primaryId}`);
    await axios.post(
      `https://api.hubapi.com/crm/v3/objects/contacts/merge`,
      {
        primaryObjectId: primaryId,
        objectIdToMerge: mergeTargetId
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOTTOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Merge successful`);
    await sleep(10000);
    return callback({
      outputFields: {
        status: 'merged',
        matchStep,
        matchesFound: 1,
        reason: 'merge_successful',
        primaryId,
        mergedId: mergeTargetId
      }
    });

  } catch (err) {
    console.error('❌ Error during dedupe/merge:', err?.response?.data || err?.message || err);
    await sleep(10000);
    return callback({
      outputFields: {
        status: 'error',
        matchStep: 'none',
        matchesFound: 0,
        reason: err?.message || 'Unknown error'
      }
    });
  }
};
