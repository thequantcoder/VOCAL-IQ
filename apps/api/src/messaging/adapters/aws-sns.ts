import { createHash, createHmac } from 'node:crypto';
import {
  type HttpClient,
  type MessageSender,
  type OutboundMessage,
  type SendResult,
  fetchHttp,
} from '../senders';

/**
 * Amazon SNS SMS via the query-protocol `Publish` action (`POST https://sns.<region>.amazonaws.com/`,
 * form-encoded params in the body, AWS Signature Version 4 auth). Global coverage; `PhoneNumber` is
 * the full E.164 destination. Signing is done in-process with `node:crypto` (no AWS SDK dependency) —
 * the HMAC key-derivation chain (AWS4→date→region→service→aws4_request) per the SigV4 spec. HTTP +
 * clock injected for offline, deterministic tests; gated on the tenant's creds.
 *
 * Docs: https://docs.aws.amazon.com/sns/latest/api/API_Publish.html +
 *       https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 */
const SERVICE = 'sns';
const API_VERSION = '2010-03-31';
const ALGORITHM = 'AWS4-HMAC-SHA256';

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

export class AwsSnsSmsSender implements MessageSender {
  readonly id = 'aws-sns';
  readonly channel: MessageSender['channel'] = 'SMS';
  constructor(
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly region: string,
    private readonly http: HttpClient = fetchHttp,
    // Injectable clock so the SigV4 timestamp (and therefore the signature) is deterministic in tests.
    private readonly now: () => Date = () => new Date(),
  ) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const region = this.region || 'us-east-1';
    const host = `sns.${region}.amazonaws.com`;
    const contentType = 'application/x-www-form-urlencoded';
    // Query-protocol params carried in the POST body; PhoneNumber stays full E.164 (keeps the +).
    const body = new URLSearchParams({
      Action: 'Publish',
      Message: msg.body,
      PhoneNumber: msg.to,
      Version: API_VERSION,
    }).toString();

    // Timestamps: x-amz-date = YYYYMMDDTHHMMSSZ, credential-scope date = YYYYMMDD.
    const amzDate = `${this.now().toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
    const dateStamp = amzDate.slice(0, 8);

    // Canonical request → string to sign → derived key → signature (SigV4).
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const canonicalRequest = [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaders,
      sha256Hex(body),
    ].join('\n');
    const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
    const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

    const kDate = hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, SERVICE);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
    const authorization = `${ALGORITHM} Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    try {
      const res = await this.http(`https://${host}/`, {
        method: 'POST',
        headers: { authorization, 'content-type': contentType, 'x-amz-date': amzDate },
        body,
      });
      const text = await res.text();
      if (!res.ok)
        return { status: 'FAILED', error: `AWS SNS ${res.status}: ${text.slice(0, 200)}` };
      const id = text.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1];
      return id ? { status: 'SENT', providerMessageId: id } : { status: 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}
