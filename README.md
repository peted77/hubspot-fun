# ℹ️ Hubspot Fun
A collection of practical, real-world HubSpot scripts, automations, and workflow hacks that make my life easier—and might just help you too.

# ⚙️ Why It Exists
HubSpot is powerful, but sometimes it's missing just that little bit of glue. `hubspot-fun` is my personal toolbox to fill those gaps—shared here in case you're solving the same problems.

Feel free to fork, use, adapt, or laugh at. PRs and improvements are always welcome.
# 🛠 Tech Stack
- JavaScript (Node.js)
- HubSpot Custom Code Actions
- HubSpot CRM API (v3)

# 🪪 License
MIT © Pete Downing

# ⚠️ Disclaimer
The code in this repository is provided “as-is,” without warranty of any kind, express or implied. I make no guarantees of performance, accuracy, or reliability. By using this code, you agree that I am not liable for any damages, data loss, or unintended outcomes resulting from its use in any system, including but not limited to HubSpot. Use at your own risk. Always test in a sandbox or development environment before deploying to production.

# 📃 Scripts
### 1. Smart Contact Deduplication Script for HubSpot Workflows
### 2. HubSpot Company Dedupe Script
### 3. HubSpot Phone Number Normalizer

# 1. Smart Contact Deduplication Script for HubSpot Workflows
Uses a series of prioritized matching strategies to identify duplicate contacts.
## Matching Steps:
1. First name + Last name + Phone number
2. First name + Last name + Email address
3. First name + Last name + Email username
4. Exact Email address match
5. Email username + root domain (e.g., "user" + "company")
6. Normalized Email username (ignores dots)
7. First name + Last name + (candidate has no email)
8. First name + Last name + Company name

## Behavior:
- If no matches are found, the workflow ends with no action
- If exactly one match is found, the enrolled contact is merged into the surviving contact
- If multiple matches are found, the workflow ends without merging
- Merge survivor is determined by most recent hs_analytics_last_timestamp
- Includes logging, API throttling, and error handling

# 2. HubSpot Company Dedupe Script
This script is designed for use in HubSpot custom code workflows. It deduplicates company records by evaluating domain, website, and fuzzy name matches. The oldest unmerged company becomes the survivor, and all others are merged into it. The script respects HubSpot API rate limits and logs merge details in the output fields.
## Matching Steps
This deduplication script evaluates company records using a prioritized, multi-step matching strategy:
1. Domain Match: Checks for exact matches on the domain property, including common variations (domain, www.domain).
2. Name Token Match: Uses CONTAINS_TOKEN on the name property to find potential matches where the company name includes part of the input name.
3. Exact Website Match: Looks for exact matches on the website property.
4. Normalized Website Match: Compares normalized versions of the website property by stripping http(s)://, www., and trailing slashes.
5. Fuzzy Name Match: Applies Levenshtein distance to find companies with high name similarity scores (> 0.9 threshold) when no strong match is found in earlier steps.

## Behavior
- The script runs inside a HubSpot custom code workflow action.
- It identifies a survivor record by selecting the oldest unmerged company (based on createdate).
- All matched companies are merged into the survivor using HubSpot’s /companies/merge API endpoint.
- The script enforces rate-limiting (250ms delay) between API calls to comply with Enterprise-tier private app limits.
- It handles previously merged records using the hs_is_merged property to avoid conflicts.
- Merge status and diagnostic info (match type, skipped IDs, failed merges, etc.) are returned to the workflow via outputFields.

# 3. HubSpot Phone Number Normalizer
Normalize phone numbers in HubSpot contact records using a custom code action inside workflows. This script converts U.S. phone numbers into E.164 format and supports four key fields: `phone`, `mobilephone`, `hq_phone_number`, and `alt_phone_number`.
## Features
- Normalizes phone numbers to `+1XXXXXXXXXX`
- Supports multiple standard and custom fields
- Avoids redundant updates
- Retries on API rate limit errors (HTTP 429)
- Logs every normalization decision

## Requirements
- HubSpot Operations Hub (for custom code actions)
- A [HubSpot Private App](https://developers.hubspot.com/docs/api/private-apps) with:
  - `crm.objects.contacts.read`
  - `crm.objects.contacts.write`
- Node.js execution environment (provided by HubSpot)

## Setup Instructions
1. Create or edit a **Contact-based workflow** in HubSpot.
2. Add a **Custom Code** action.
3. Paste in the code from `index.js`.
4. Under **Secrets**, add:

| Name         | Value (example)                 |
|--------------|----------------------------------|
| `secretName` | `pat-na1-abc123...` (your token) |

5. Enroll contacts to trigger normalization.

## Example
**Before**:
- `phone`: (305) 391-4414  
- `hq_phone_number`: 305-391-4414

**After**:
- `phone`: +13053914414  
- `hq_phone_number`: +13053914414
