# Security Policy

## Reporting a Vulnerability

We take the security and privacy of ASCEND and our users seriously. Because ASCEND operates on a **local-first default architecture**, user workout records, body metrics, and personal data remain strictly on-device in Guest Mode, or in encrypted PostgreSQL tables guarded by Row Level Security (RLS) when opted into Cloud Mode.

If you believe you have discovered a security vulnerability or privacy flaw (such as unexpected network telemetry, API key leakage, or unsafe dependencies), please report it responsibly:

- **Email:** Report details directly to [shivamarora9216@gmail.com](mailto:shivamarora9216@gmail.com)
- **GitHub:** Or open a private security advisory through the repository's **Security > Report a vulnerability** tab.

Please include:
1. Description of the issue and potential impact.
2. Steps or proof-of-concept to reproduce the behavior.
3. Relevant environment details (Browser, OS version, or Android runtime).

We will review reports promptly and publish patches to protect all users.

---

## Architecture & Data Safety Guidelines

- **On-Device Storage:** In Guest Mode, all workout sessions, personal records, body metrics, habit checks, and theme preferences reside solely in client-side `localStorage`.
- **API Key Confidentiality:** If you provide a custom Google Gemini API Key in Settings, that key is kept strictly within your device's browser memory. It is never transmitted to, collected by, or logged on any external server.
- **External Network Requests:** External requests are strictly limited to:
  - User-initiated Google Gemini API calls (Autoregulated Coach, Macro Lens Photo Estimator, and Natural Language Meal Parsing).
  - Anonymous barcode lookups to the Open Food Facts public database.
  - Optional user-authenticated Supabase cloud synchronization and account management.
  - Optional Web Push reminder delivery when explicitly enabled by the athlete.
  - App asset loading via standard web hosting (e.g. Vercel).
