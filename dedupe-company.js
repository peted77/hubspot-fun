// HubSpot Company Dedupe Script
// Description: This script is designed for use in HubSpot custom code workflows. It deduplicates company records by evaluating domain, website, and fuzzy name matches. The oldest unmerged company becomes the survivor, and all others are merged into it. The script respects HubSpot API rate limits and logs merge details in the output fields.

const { Client } = require('@hubspot/api-client');
const axios = require('axios');
const hubspotClient = new Client({ accessToken: process.env.HUBSPOTTOKEN });

// 🔣 Utility: Levenshtein distance for fuzzy string matching
function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// 🔣 Utility: Returns name similarity score using Levenshtein
function nameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  const dist = levenshtein(name1.toLowerCase(), name2.toLowerCase());
  return 1 - dist / Math.max(name1.length, name2.length);
}

// 🔣 Utility: Normalize a URL string
const normalizeUrl = url => url?.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '') ?? '';

// 🔣 Utility: Strip "www." from domain
const stripDomain = domain => domain?.replace(/^www\./i, '') ?? '';

// 🔁 Utility: Retry logic with exponential backoff
const retryWithBackoff = async (fn, retries = 3, delay = 500) => {
  try {
    return await fn();
  } catch (e) {
    if (retries && e.response?.status === 429) {
      await new Promise(r => setTimeout(r, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw e;
  }
};

exports.main = async (event, callback) => {
  // 🔢 Step 1: Extract company fields from workflow input
  const inputCompanyId = event.inputFields['hs_object_id'];
  const name = event.inputFields['name'];
  const domain = event.inputFields['domain'];
  const website = event.inputFields['website'];
  const createdate = event.inputFields['createdate'];

  const emptyOutputs = {
    status: '', match_type: '', merged_count: 0, total_records_considered: 0,
    merged_from_ids: '', failed_merge_ids: '', skipped_merge_ids: '',
    survivor_id: '', survivor_name: '', survivor_createdate: ''
  };

  if (!inputCompanyId || isNaN(Number(inputCompanyId))) {
    return callback({ outputFields: { ...emptyOutputs, status: 'Missing or invalid company ID' } });
  }

  // 🌐 Step 2: Normalize domain and website
  const baseDomain = stripDomain(domain || normalizeUrl(website));
  const normalizedWebsite = normalizeUrl(website);

  let matchType = '';
  let matches = [];

  // 🔍 Step 3: Utility to search for companies
  const searchCompanies = async (searchBody) => {
    const result = await hubspotClient.crm.companies.searchApi.doSearch(searchBody);
    await new Promise(r => setTimeout(r, 250)); // ⏱️ Prevent rate limiting
    return Array.isArray(result.results) ? result.results : [];
  };

  try {
    // 🔎 Step 4–8: Matching logic (domain, name token, exact website, normalized website, fuzzy name)
    // (unchanged...)

    // 🔄 Step 11: Merge all other duplicates into survivor
    const duplicatesToCheck = enrichedMatches.filter(c => c.id !== survivor.id);
    let mergedCount = 0, mergedFromIds = [], failedMergeIds = [], skippedMergeIds = [];

    for (const duplicate of duplicatesToCheck) {
      try {
        const details = await hubspotClient.crm.companies.basicApi.getById(duplicate.id, ['hs_is_merged']);
        await new Promise(r => setTimeout(r, 250));
        const isMerged = (details?.body?.properties?.hs_is_merged || 'false') === 'true';
        if (isMerged && matchType !== 'domain') {
          skippedMergeIds.push(duplicate.id);
          continue;
        }

        // 👇 Revert to using Axios for merge (HubSpot SDK does not support it reliably)
        await retryWithBackoff(() => axios.post(
          'https://api.hubapi.com/crm/v3/objects/companies/merge',
          {
            primaryObjectId: survivor.id,
            objectIdToMerge: duplicate.id
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.HUBSPOTTOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        ));

        mergedCount++;
        mergedFromIds.push(duplicate.id);
        await new Promise(r => setTimeout(r, 250));
      } catch (err) {
        failedMergeIds.push(duplicate.id);
      }
    }

    // ✅ Step 12: Return results (unchanged...)

  } catch (error) {
    return callback({ outputFields: { ...emptyOutputs, status: `Fatal error: ${error.message}`, survivor_id: inputCompanyId, survivor_name: name || '' } });
  }
};
