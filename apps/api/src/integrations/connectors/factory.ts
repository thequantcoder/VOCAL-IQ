import { IntegrationType } from '@vocaliq/shared';
import { type Connector, type HttpClient, fetchHttp } from './connector';
import { HubSpotConnector } from './hubspot.connector';
import { SalesforceConnector } from './salesforce.connector';
import { WebhookConnector } from './webhook.connector';
import { ZendeskConnector } from './zendesk.connector';

/**
 * Build a connector for an integration type from its decrypted token + settings. HubSpot, Salesforce,
 * Zendesk, and Webhook/Zapier are implemented; a connector that needs a settings value it doesn't have
 * (Zendesk `subdomain`, Salesforce `instanceUrl`, Webhook/Zapier `url`) returns null so the service
 * treats it as "connected but sync pending" rather than erroring. GOOGLE has no contact-sync capability
 * by design (CONNECTOR_META) → null. Injectable so `IntegrationsService` tests can supply a fake.
 */
export type ConnectorFactory = (
  type: IntegrationType,
  token: string,
  settings: Record<string, string>,
) => Connector | null;

export function defaultConnectorFactory(http: HttpClient = fetchHttp): ConnectorFactory {
  return (type, token, settings) => {
    switch (type) {
      case IntegrationType.HUBSPOT:
        return new HubSpotConnector(token, http);
      case IntegrationType.ZENDESK:
        return settings.subdomain ? new ZendeskConnector(token, settings.subdomain, http) : null;
      case IntegrationType.SALESFORCE:
        return settings.instanceUrl
          ? new SalesforceConnector(token, settings.instanceUrl, http)
          : null;
      case IntegrationType.WEBHOOK:
      case IntegrationType.ZAPIER:
        return settings.url ? new WebhookConnector(type, settings.url, http, token) : null;
      // GOOGLE: no contact-sync capability by design (CONNECTOR_META).
      default:
        return null;
    }
  };
}
