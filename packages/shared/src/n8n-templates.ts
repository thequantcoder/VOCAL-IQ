/**
 * Ready-made n8n workflow templates (COMPETITOR delta #3). VocalIQ is already a first-class n8n
 * citizen — its public API (actions like `POST /v1/calls/dial`) is callable from n8n's HTTP node,
 * and its signed webhooks (triggers like `call.completed`) drive n8n's Webhook node — so this ships
 * importable starter workflows rather than a bespoke node package (400+ app reach, zero lock-in).
 *
 * Each template is a valid n8n workflow document the user imports and then fills in their API key +
 * (for triggers) points a VocalIQ webhook at the n8n Webhook node's URL.
 */

export interface N8nTemplate {
  id: string;
  name: string;
  description: string;
  /** A valid n8n workflow document (import via n8n → Workflows → Import from File/URL). */
  workflow: Record<string, unknown>;
}

/**
 * Build the template set against a concrete API base URL (so the HTTP nodes are pre-filled). The
 * API key is left as an `<YOUR_API_KEY>` placeholder — never embed a real secret in a shipped file.
 */
export function buildN8nTemplates(apiBaseUrl: string): N8nTemplate[] {
  const base = apiBaseUrl.replace(/\/$/, '');

  return [
    {
      id: 'instant-dial',
      name: 'VocalIQ — Instant AI Call',
      description:
        'Trigger an AI phone call from any n8n workflow: POST a phone number + agent to /v1/calls/dial (auto-creates a lead).',
      workflow: {
        name: 'VocalIQ — Instant AI Call',
        nodes: [
          {
            parameters: {},
            id: 'trigger',
            name: 'When triggered',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [240, 300],
          },
          {
            parameters: {
              method: 'POST',
              url: `${base}/v1/calls/dial`,
              sendHeaders: true,
              headerParameters: {
                parameters: [{ name: 'Authorization', value: 'Bearer <YOUR_API_KEY>' }],
              },
              sendBody: true,
              specifyBody: 'json',
              jsonBody:
                '={\n  "to": "{{ $json.phone }}",\n  "agentId": "<YOUR_AGENT_ID>",\n  "consentBasis": "SOFT_OPT_IN",\n  "name": "{{ $json.name }}"\n}',
            },
            id: 'dial',
            name: 'VocalIQ Instant Dial',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4,
            position: [480, 300],
          },
        ],
        connections: {
          'When triggered': { main: [[{ node: 'VocalIQ Instant Dial', type: 'main', index: 0 }]] },
        },
      },
    },
    {
      id: 'form-to-call',
      name: 'VocalIQ — Form → AI Call',
      description:
        'Receive a form submission on an n8n Webhook, then have VocalIQ call the submitter within seconds via /v1/calls/dial.',
      workflow: {
        name: 'VocalIQ — Form → AI Call',
        nodes: [
          {
            parameters: { httpMethod: 'POST', path: 'vocaliq-form', options: {} },
            id: 'formhook',
            name: 'Form Submitted',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [240, 300],
          },
          {
            parameters: {
              method: 'POST',
              url: `${base}/v1/calls/dial`,
              sendHeaders: true,
              headerParameters: {
                parameters: [{ name: 'Authorization', value: 'Bearer <YOUR_API_KEY>' }],
              },
              sendBody: true,
              specifyBody: 'json',
              jsonBody:
                '={\n  "to": "{{ $json.body.phone }}",\n  "agentId": "<YOUR_AGENT_ID>",\n  "consentBasis": "SOFT_OPT_IN",\n  "name": "{{ $json.body.name }}",\n  "source": "n8n-form"\n}',
            },
            id: 'dial',
            name: 'VocalIQ Instant Dial',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4,
            position: [480, 300],
          },
        ],
        connections: {
          'Form Submitted': { main: [[{ node: 'VocalIQ Instant Dial', type: 'main', index: 0 }]] },
        },
      },
    },
    {
      id: 'call-completed',
      name: 'VocalIQ — On Call Completed',
      description:
        'Fires when a VocalIQ call finishes: register a VocalIQ webhook (event call.completed) pointing at this workflow’s Webhook URL, then fan out to any of n8n’s 400+ apps (CRM, Slack, Sheets…).',
      workflow: {
        name: 'VocalIQ — On Call Completed',
        nodes: [
          {
            parameters: { httpMethod: 'POST', path: 'vocaliq-call-completed', options: {} },
            id: 'callhook',
            name: 'Call Completed (VocalIQ)',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [240, 300],
          },
          {
            parameters: {
              values: {
                string: [
                  { name: 'callId', value: '={{ $json.body.data.callId }}' },
                  { name: 'status', value: '={{ $json.body.data.status }}' },
                  { name: 'disposition', value: '={{ $json.body.data.disposition }}' },
                ],
              },
              options: {},
            },
            id: 'extract',
            name: 'Extract Call Fields',
            type: 'n8n-nodes-base.set',
            typeVersion: 2,
            position: [480, 300],
          },
        ],
        connections: {
          'Call Completed (VocalIQ)': {
            main: [[{ node: 'Extract Call Fields', type: 'main', index: 0 }]],
          },
        },
      },
    },
  ];
}
