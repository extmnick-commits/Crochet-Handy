/**
 * GitHub Actions reader for Firestore `community_submissions`.
 *
 * Uses a service account (or a short-lived access token) from the environment.
 * Those credentials stay on the runner — the mobile app never sees them.
 */
import { createSign } from 'crypto';
import * as fs from 'fs';

import type { CommunityCatalogSubmission } from '../store/machine';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type FirestoreValue = {
  stringValue?: string;
  timestampValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

export type PendingCommunitySubmission = CommunityCatalogSubmission & {
  documentName: string;
};

export async function pullPendingCommunitySubmissions(): Promise<PendingCommunitySubmission[]> {
  const auth = await resolveFirestoreAuth();
  if (!auth) {
    console.log('Community sync skipped: no Firebase service account or access token in the environment.');
    return [];
  }
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${auth.projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'community_submissions' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: 'pending' },
            },
          },
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Firestore query failed (${response.status}).`);
  }
  const rows = (await response.json()) as { document?: { name?: string; fields?: Record<string, FirestoreValue> } }[];
  const pending: PendingCommunitySubmission[] = [];
  for (const row of rows) {
    const name = row.document?.name;
    if (!name) continue;
    const parsed = parseCommunityDocument(name, row.document?.fields);
    if (parsed) pending.push(parsed);
  }
  return pending;
}

export async function markCommunitySubmissionsApproved(documentNames: readonly string[]): Promise<void> {
  await markCommunitySubmissionStatus(documentNames, 'approved');
}

export async function markCommunitySubmissionsRejected(documentNames: readonly string[]): Promise<void> {
  await markCommunitySubmissionStatus(documentNames, 'rejected');
}

async function markCommunitySubmissionStatus(
  documentNames: readonly string[],
  status: 'approved' | 'rejected',
): Promise<void> {
  if (documentNames.length === 0) return;
  const auth = await resolveFirestoreAuth();
  if (!auth) return;
  for (const name of documentNames) {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/${name}?updateMask.fieldPaths=status`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: { status: { stringValue: status } },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Firestore status update failed (${response.status}).`);
    }
  }
}

export function parseCommunityDocument(
  documentName: string,
  fields: Record<string, FirestoreValue> | undefined,
): PendingCommunitySubmission | null {
  if (!fields) return null;
  const steps = readStringList(fields.steps);
  const title = readString(fields.title);
  const videoUrl = readString(fields.videoUrl);
  const source = readString(fields.source);
  if (!title || !videoUrl || steps.length === 0) return null;
  if (source !== 'facebook' && source !== 'web' && source !== 'youtube') return null;
  return {
    documentName,
    title,
    steps,
    hookSize: readString(fields.hookSize),
    yarnWeight: readString(fields.yarnWeight),
    source,
    videoUrl,
    status: readString(fields.status) || 'pending',
  };
}

export function communityCatalogPatternId(title: string, videoUrl: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
  let hash = 0;
  for (const char of videoUrl) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0;
  return `community-${slug || 'pattern'}-${hash.toString(36)}`.slice(0, 80);
}

async function resolveFirestoreAuth(): Promise<{ projectId: string; token: string } | null> {
  const bearer = process.env.FIREBASE_ACCESS_TOKEN?.trim();
  const bearerProject = process.env.FIREBASE_PROJECT_ID?.trim();
  if (bearer && bearerProject) return { projectId: bearerProject, token: bearer };

  const account = readServiceAccount();
  if (!account) return null;
  const token = await fetchAccessToken(account);
  return { projectId: account.project_id, token };
}

function readServiceAccount(): ServiceAccount | null {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  let raw = inline ?? '';
  if (!raw && encoded) raw = Buffer.from(encoded, 'base64').toString('utf8');
  if (!raw && filePath && fs.existsSync(filePath)) raw = fs.readFileSync(filePath, 'utf8');
  if (!raw) return null;
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new Error('Firebase service account is set but is not valid JSON.');
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Firebase service account is missing project_id, client_email, or private_key.');
  }
  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

async function fetchAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: DATASTORE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Firebase access token request failed (${response.status}).`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error('Firebase access token response was empty.');
  return payload.access_token;
}

function readString(value: FirestoreValue | undefined): string {
  return value?.stringValue?.trim() ?? '';
}

function readStringList(value: FirestoreValue | undefined): string[] {
  const values = value?.arrayValue?.values ?? [];
  return values.map((item) => item.stringValue?.trim() ?? '').filter((item) => item.length > 0);
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}
