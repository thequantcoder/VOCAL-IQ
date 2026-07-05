# Runbook — Key Rotation

- **Provider keys (tenant BYOK or platform):** **Key vault** → Rotate (re-encrypts under the vault
  master key; audited). Old key is overwritten; the resolver picks up the new one on the next call.
- **Vault master key (`VAULT_MASTER_KEY`):** envelope encryption means only the wrapped data keys
  change. To rotate the master: set the new master, re-wrap each `encryptedKey` (decrypt with old →
  encrypt with new) in a maintenance job, then remove the old master. Do this in a low-traffic window.
- **Auth secret (`APP_JWT_SECRET`):** rotating invalidates all sessions (users re-login). Schedule +
  announce; support dual-secret verification during the window if zero-downtime is required.
- **SCIM tokens:** re-run SSO config to mint a fresh token (old hash overwritten).
