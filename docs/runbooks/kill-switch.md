# Runbook — Kill-Switch

- **A single number is abusing the platform:** add it to the DNC/suppression list
  (`/dashboard/settings/compliance` → Do-not-call, or `POST /compliance/dnc`, `global:true` for
  platform-wide). Outbound refuses it pre-dial immediately.
- **A tenant is spamming:** the abuse gate auto-blocks bursts; to hard-stop, **suspend the tenant**
  in the super-admin console (audited) — all their calls stop.
- **A provider is down/leaking:** disable its keys in **Key pool**; the router fails over to the
  remaining keys/providers via routing defaults.
- **Global halt (SEV1):** scale voice to 0 replicas (K8s) to stop all new media sessions while you
  investigate; in-flight calls drain.
