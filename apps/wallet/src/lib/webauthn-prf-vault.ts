import { getRandomBytes } from '@repo/crypto';
import { del, get, set } from 'idb-keyval';
import type { Uint8Array_ } from '@repo/types';
import { base64UrlToBytes, bytesToBase64Url } from '@repo/utils';

const WALLET_SEED_RECORD_KEY = 'wallet-seed-record-v1';

type SeedVaultRecord = {
  version: 1;
  credentialIdB64Url: string;
  prfSaltB64Url: string;
  ivB64Url: string;
  cipherTextB64Url: string;
  createdAt: number;
};

const toBytes = (value: unknown): Uint8Array_ | null => {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value) as Uint8Array_;
  }

  if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) as Uint8Array_;
  }

  return null;
};

const getRpId = (): string | undefined => {
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return hostname;
  }

  return hostname.includes('.') ? hostname : undefined;
};

const assertWebAuthnAvailability = (): void => {
  if (!('PublicKeyCredential' in window) || !navigator.credentials) {
    throw new Error('WebAuthn is not available in this browser or context.');
  }
};

const registerCredential = async (): Promise<Uint8Array_> => {
  assertWebAuthnAvailability();

  const userId = getRandomBytes(32);
  const creationOptions: PublicKeyCredentialCreationOptions = {
    challenge: getRandomBytes(32),
    rp: {
      name: 'Wal Wallet',
      id: getRpId(),
    },
    user: {
      id: userId,
      name: `wal-${Date.now()}@local`,
      displayName: 'Wal Wallet User',
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    timeout: 60000,
    authenticatorSelection: {
      userVerification: 'preferred',
    },
    attestation: 'none',
    extensions: {
      prf: {
        eval: {
          first: getRandomBytes(32),
        },
      },
    } as AuthenticationExtensionsClientInputs,
  };

  const created = (await navigator.credentials.create({
    publicKey: creationOptions,
  })) as PublicKeyCredential | null;

  if (!created) {
    throw new Error('Credential registration was cancelled.');
  }

  return new Uint8Array(created.rawId) as Uint8Array_;
};

const evaluatePrf = async (credentialId: Uint8Array_, salt: Uint8Array_): Promise<Uint8Array_> => {
  assertWebAuthnAvailability();

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge: getRandomBytes(32),
    timeout: 60000,
    userVerification: 'preferred',
    allowCredentials: [
      {
        id: credentialId,
        type: 'public-key',
      },
    ],
    extensions: {
      prf: {
        eval: {
          first: salt,
        },
      },
    } as AuthenticationExtensionsClientInputs,
  };

  const assertion = (await navigator.credentials.get({
    publicKey: requestOptions,
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('WebAuthn verification was cancelled.');
  }

  const extensionResults = assertion.getClientExtensionResults() as {
    prf?: {
      results?: {
        first?: ArrayBuffer;
      };
    };
  };

  const prfOutput = toBytes(extensionResults.prf?.results?.first);

  if (!prfOutput || prfOutput.length === 0) {
    throw new Error('WebAuthn PRF output is unavailable on this authenticator/browser.');
  }

  return prfOutput;
};

const getAesKeyFromPrf = async (prfOutput: Uint8Array_): Promise<CryptoKey> => {
  const digest = await crypto.subtle.digest('SHA-256', prfOutput);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const encryptSeed = async (
  seed: Uint8Array_,
  prfOutput: Uint8Array_,
): Promise<{ iv: Uint8Array_; cipherText: Uint8Array_ }> => {
  const key = await getAesKeyFromPrf(prfOutput);
  const iv = getRandomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    seed,
  );

  return {
    iv: iv as Uint8Array_,
    cipherText: new Uint8Array(encrypted) as Uint8Array_,
  };
};

const decryptSeed = async (cipherText: Uint8Array_, iv: Uint8Array_, prfOutput: Uint8Array_): Promise<Uint8Array_> => {
  const key = await getAesKeyFromPrf(prfOutput);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    cipherText,
  );

  return new Uint8Array(decrypted) as Uint8Array_;
};

const readSeedRecord = async (): Promise<SeedVaultRecord | null> => {
  return (await get<SeedVaultRecord | null>(WALLET_SEED_RECORD_KEY)) ?? null;
};

const writeSeedRecord = async (record: SeedVaultRecord): Promise<void> => {
  await set(WALLET_SEED_RECORD_KEY, record);
};

const assertSecureContext = (): void => {
  if (!window.isSecureContext) {
    throw new Error('WebAuthn PRF requires a secure context (HTTPS or localhost).');
  }
};

export const hasSeedVault = async (): Promise<boolean> => {
  const record = await readSeedRecord();
  return record !== null;
};

export const clearSeedVault = async (): Promise<void> => {
  await del(WALLET_SEED_RECORD_KEY);
};

export const setupSeedVault = async (seed: Uint8Array_): Promise<void> => {
  assertSecureContext();

  const credentialId = await registerCredential();
  const prfSalt = getRandomBytes(32);
  const prfOutput = await evaluatePrf(credentialId, prfSalt);
  const encryptedSeed = await encryptSeed(seed, prfOutput);

  const record: SeedVaultRecord = {
    version: 1,
    credentialIdB64Url: bytesToBase64Url(credentialId),
    prfSaltB64Url: bytesToBase64Url(prfSalt),
    ivB64Url: bytesToBase64Url(encryptedSeed.iv),
    cipherTextB64Url: bytesToBase64Url(encryptedSeed.cipherText),
    createdAt: Date.now(),
  };

  await writeSeedRecord(record);
};

export const replaceSeedInVault = async (seed: Uint8Array_): Promise<void> => {
  assertSecureContext();

  const record = await readSeedRecord();
  if (!record) {
    throw new Error('No encrypted seed found. Create a wallet first.');
  }

  const credentialId = base64UrlToBytes(record.credentialIdB64Url);
  const prfSalt = base64UrlToBytes(record.prfSaltB64Url);
  const prfOutput = await evaluatePrf(credentialId, prfSalt);
  const encryptedSeed = await encryptSeed(seed, prfOutput);

  await writeSeedRecord({
    ...record,
    ivB64Url: bytesToBase64Url(encryptedSeed.iv),
    cipherTextB64Url: bytesToBase64Url(encryptedSeed.cipherText),
  });
};

export const decryptSeedFromVault = async (): Promise<Uint8Array_> => {
  assertSecureContext();

  const record = await readSeedRecord();
  if (!record) {
    throw new Error('No encrypted seed found. Create a wallet first.');
  }

  const credentialId = base64UrlToBytes(record.credentialIdB64Url);
  const prfSalt = base64UrlToBytes(record.prfSaltB64Url);
  const iv = base64UrlToBytes(record.ivB64Url);
  const cipherText = base64UrlToBytes(record.cipherTextB64Url);

  const prfOutput = await evaluatePrf(credentialId, prfSalt);

  return decryptSeed(cipherText, iv, prfOutput);
};
