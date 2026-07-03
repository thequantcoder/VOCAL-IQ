import { IntegrationType } from '@vocaliq/shared';
import { type Connector, type HttpClient, fetchHttp } from './connector';
import { HubSpotConnector } from './hubspot.connector';

/**
 * Build a connector for an integration type from its decrypted token + settings. HubSpot is
 * fully implemented; Salesforce/Zendesk/etc. are recognised but not yet built, so the factory
 * returns null for them — the service treats a null connector as "connected but sync pending"
 * rather than erroring (build-now-gate-live). Injectable so `IntegrationsService` tests can
 * supply a fake factory returning a spy connector.
 */
export type ConnectorFactory = (
  type: IntegrationType,
  token: string,
  settings: Record<string, string>,
) => Connector | null;

export function defaultConnectorFactory(http: HttpClient = fetchHttp): ConnectorFactory {
  return (type, token) => {
    switch (type) {
      case IntegrationType.HUBSPOT:
        return new HubSpotConnector(token, http);
      // SALESFORCE / ZENDESK / GOOGLE / ZAPIER / WEBHOOK: framework-ready, not yet implemented.
      default:
        return null;
    }
  };
}
