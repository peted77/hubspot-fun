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
