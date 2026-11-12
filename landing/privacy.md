---
title: Privacy Policy — smartsht
description: Privacy Policy for smartsht. The workbook stays in your browser unless you enable cloud backup. AI questions send a cell summary.
---

[← Back to smartsht.com](https://smartsht.com/)

# Privacy Policy

Last updated: October 6, 2026

## Summary

The workbook stays in your browser unless you turn on cloud backup. The formula auditor runs locally. An AI question sends that question and a summary of relevant cells to our server, or to the provider on your own API key. We don't sell your data.

## What We Collect

| Data | Purpose | Stored Where |
| --- | --- | --- |
| Email address | Account creation, billing receipts | Clerk (auth provider) |
| Name (optional) | Account display | Clerk |
| Payment info | Subscription billing | Stripe (payment processor) |
| AI chat messages and a cell summary | Generate a response | Processed in memory on our server, or sent to your BYOK provider. Not stored. |
| Usage counts | Free tier enforcement | Server-side, anonymized |
| Device/browser info | Security, compatibility | Server logs (30 day retention) |

## What We Don't Collect

- The workbook file itself, unless you turn on cloud backup
- A stored copy of financial figures, budget amounts, or expense details
- Browsing history or third-party tracking cookies
- Data from other apps or services
- Location data

## How AI Queries Work

When you send a message to the AI assistant, your message and a summary of relevant cells are sent to our server to generate a response. This data is processed in memory and discarded after the response. We do not log, store, or train on your queries or spreadsheet content. If you bring your own API key, that same message and cell summary go to the provider you chose, and that provider bills the tokens. We do not meter those calls. Your key is saved in this browser's local storage (not encrypted) and is forwarded through our server with each request to reach the provider; we do not store it.

## Cookies and Tracking

We use essential cookies only for authentication sessions (via Clerk). We do not use:

- Advertising cookies
- Third-party analytics trackers
- Cross-site tracking pixels
- Fingerprinting techniques

## Third-Party Services

- **Clerk** — Authentication. [Their privacy policy](https://clerk.com/privacy).
- **Stripe** — Payments. [Their privacy policy](https://stripe.com/privacy).
- **Cloudflare** — CDN and DDoS protection. [Their privacy policy](https://www.cloudflare.com/privacypolicy/).
- **AI providers** — Groq, OpenRouter, Hugging Face, or the provider in your BYOK settings. They receive the message and cell summary for that request only.

## Data Retention

- **Account data:** Retained while your account is active. Deleted within 30 days of account deletion request.
- **Payment records:** Retained as required by law (typically 7 years for tax purposes).
- **Server logs:** Automatically purged after 30 days.
- **Spreadsheet data:** The workbook is stored in your browser. We do not keep a copy unless you turn on cloud backup. AI requests are processed in memory and discarded.

## Your Rights

You have the right to:

- Export your spreadsheet data at any time (File → Export)
- Request deletion of your account and associated data
- Request a copy of any personal data we hold about you
- Opt out of non-essential communications
- Lodge a complaint with a data protection authority

To exercise these rights, contact [support@smartsht.com](mailto:support@smartsht.com). We respond within 30 days.

## International Users

Our servers are located in the United States. If you access the Service from outside the US, your information may be transferred to and processed in the US. By using the Service, you consent to this transfer.

## Children's Privacy

smartsht is not intended for children under 13. We do not knowingly collect personal information from children. If we discover we have collected data from a child under 13, we will delete it promptly.

## Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be communicated via email at least 14 days in advance. Continued use after the effective date constitutes acceptance.

## Contact

Privacy questions: [support@smartsht.com](mailto:support@smartsht.com)

```json
{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"https://smartsht.com/privacy#webpage","url":"https://smartsht.com/privacy","name":"Privacy Policy — smartsht","description":"Privacy Policy for smartsht. The workbook stays in your browser unless you enable cloud backup. AI questions send a cell summary.","isPartOf":{"@id":"https://smartsht.com/#website"},"about":{"@id":"https://smartsht.com/#organization"},"dateModified":"2026-10-06","inLanguage":"en-US","breadcrumb":{"@id":"https://smartsht.com/privacy#breadcrumb"}},{"@type":"BreadcrumbList","@id":"https://smartsht.com/privacy#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://smartsht.com/"},{"@type":"ListItem","position":2,"name":"Privacy Policy","item":"https://smartsht.com/privacy"}]}]}
```
