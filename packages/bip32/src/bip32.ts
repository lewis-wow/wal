import { secp256k1 } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';
import { assert } from '@repo/assert';
import type { Uint8Array_ } from '@repo/types';
import {
  UINT32_MAX,
  bigIntToBytes,
  bytesConcat,
  bytesToBigInt,
  bytesToUint32,
  ensureValidPrivateKey,
  ensureValidPublicKey,
  hash160,
  uint32ToBytes,
} from '@repo/utils';

import { decodeBase58Check, encodeBase58Check } from './base58check.js';
import { Bip32Network } from './enums/Bip32Network.js';
import { getNetworkByVersion } from './helpers/getNetworkByVersion.js';
import { HARDENED_OFFSET, isHardenedIndex, toHardenedIndex } from './helpers/hardenedIndex.js';
import { parsePathIndex } from './helpers/parsePathIndex.js';
import { splitHmac512 } from './helpers/splitHmac512.js';

const SECP256K1_ORDER = secp256k1.Point.CURVE().n;
const DEFAULT_MASTER_SECRET = 'Bitcoin seed';

const VERSIONS = {
  mainnet: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  testnet: {
    public: 0x043587cf,
    private: 0x04358394,
  },
} as const;

export type Bip32MasterSecret = string | Uint8Array_;

export type Bip32NodeOptions = {
  privateKey?: Uint8Array;
  publicKey: Uint8Array;
  chainCode: Uint8Array;
  depth: number;
  parentFingerprint: number;
  childNumber: number;
  network: Bip32Network;
};

/**
 * @see https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
 */
export class Bip32Node {
  public readonly privateKey?: Uint8Array_;
  public readonly publicKey: Uint8Array_;
  public readonly chainCode: Uint8Array_;
  public readonly depth: number;
  public readonly parentFingerprint: number;
  public readonly childNumber: number;
  public readonly network: Bip32Network;

  private constructor(options: Bip32NodeOptions) {
    const { privateKey, publicKey, chainCode, depth, parentFingerprint, childNumber, network } = options;

    if (privateKey !== undefined) {
      ensureValidPrivateKey(privateKey, SECP256K1_ORDER);
    }

    ensureValidPublicKey(publicKey);

    assert(chainCode.length === 32, 'Chain code must be 32 bytes');
    assert(Number.isInteger(depth) && depth >= 0 && depth <= 255, 'Depth must be a uint8');
    assert(
      Number.isInteger(parentFingerprint) && parentFingerprint >= 0 && parentFingerprint <= UINT32_MAX,
      'Parent fingerprint must be a uint32',
    );
    assert(
      Number.isInteger(childNumber) && childNumber >= 0 && childNumber <= UINT32_MAX,
      'Child number must be a uint32',
    );

    this.privateKey = privateKey?.slice() as Uint8Array_ | undefined;
    this.publicKey = publicKey.slice() as Uint8Array_;
    this.chainCode = chainCode.slice() as Uint8Array_;
    this.depth = depth;
    this.parentFingerprint = parentFingerprint;
    this.childNumber = childNumber;
    this.network = network;
  }

  public static fromSeed(opts: {
    seed: Uint8Array_;
    network?: Bip32Network;
    masterSecret?: Bip32MasterSecret;
  }): Bip32Node {
    const { seed, network = Bip32Network.Mainnet, masterSecret = DEFAULT_MASTER_SECRET } = opts;

    const seedBytes = new Uint8Array(seed);
    assert(seedBytes.length >= 16 && seedBytes.length <= 64, 'Seed must be between 16 and 64 bytes');
    const hmacKey =
      typeof masterSecret === 'string' ? new TextEncoder().encode(masterSecret) : new Uint8Array(masterSecret);
    assert(hmacKey.length > 0, 'Master secret must not be empty');

    const I = hmac(sha512, hmacKey, seedBytes);
    const [IL, IR] = splitHmac512(I);
    const masterKey = bytesToBigInt(IL);

    assert(masterKey > 0n && masterKey < SECP256K1_ORDER, 'Master private key is invalid');

    const privateKey = bigIntToBytes(masterKey, 32);
    const publicKey = secp256k1.getPublicKey(privateKey, true);

    return new Bip32Node({
      privateKey,
      publicKey,
      chainCode: IR,
      depth: 0,
      parentFingerprint: 0,
      childNumber: 0,
      network,
    });
  }

  public static fromExtendedKey(base58: string): Bip32Node {
    const decoded = decodeBase58Check(base58);
    // 4 bytes: version bytes (
    //    mainnet: 0x0488B21E public, 0x0488ADE4 private;
    //    testnet: 0x043587CF public, 0x04358394 private
    // )
    const version = bytesToUint32(decoded.slice(0, 4));

    const networkWithVersion = getNetworkByVersion(VERSIONS, version);
    assert(networkWithVersion !== undefined, 'Unknown extended key version');

    const [networkKey, versionSet] = networkWithVersion;
    const network = networkKey as Bip32Network;

    // 1 byte: depth: 0x00 for master nodes, 0x01 for level-1 derived keys, ....
    const depth = decoded[4]!;
    // 4 bytes: the fingerprint of the parent's key (0x00000000 if master key)
    const parentFingerprint = bytesToUint32(decoded.slice(5, 9));
    // 4 bytes: child number.
    // This is ser32(i) for i in xi = xpar/i, with xi the key being serialized.
    // (0x00000000 if master key)
    const childNumber = bytesToUint32(decoded.slice(9, 13));
    // 32 bytes: the chain code
    const chainCode = decoded.slice(13, 45);
    // 33 bytes: the public key or private key data (serP(K) for public keys, 0x00 || ser256(k) for private keys)
    const keyData = decoded.slice(45, 78);

    if (depth === 0) {
      assert(parentFingerprint === 0, 'Master key must have parent fingerprint 0');
      assert(childNumber === 0, 'Master key must have child number 0');
    }

    if (version === versionSet.private) {
      assert(keyData[0] === 0, 'Invalid private key prefix');
      const privateKey = keyData.slice(1);
      ensureValidPrivateKey(privateKey, SECP256K1_ORDER);
      const publicKey = secp256k1.getPublicKey(privateKey, true);

      return new Bip32Node({
        privateKey,
        publicKey,
        chainCode,
        depth,
        parentFingerprint,
        childNumber,
        network,
      });
    }

    ensureValidPublicKey(keyData);

    return new Bip32Node({
      publicKey: keyData,
      chainCode,
      depth,
      parentFingerprint,
      childNumber,
      network,
    });
  }

  public getIdentifier(): Uint8Array_ {
    return hash160(this.publicKey) as Uint8Array_;
  }

  public getFingerprint(): number {
    return bytesToUint32(this.getIdentifier().slice(0, 4));
  }

  public neuter(): Bip32Node {
    return new Bip32Node({
      publicKey: this.publicKey,
      chainCode: this.chainCode,
      depth: this.depth,
      parentFingerprint: this.parentFingerprint,
      childNumber: this.childNumber,
      network: this.network,
    });
  }

  /**
   * Each extended key has 2^31 normal child keys and 2^31 hardened child keys.
   * Each child key has an index.
   * Normal child keys use indices 0 through 2^31 - 1.
   * Hardened child keys use indices 2^31 through 2^32 - 1.
   */
  public derive(index: number): Bip32Node {
    assert(Number.isInteger(index) && index >= 0 && index <= UINT32_MAX, 'Index must be a uint32');

    if (this.privateKey) {
      return this.derivePrivateChild(index);
    }

    return this.derivePublicChild(index);
  }

  public deriveHardened(index: number): Bip32Node {
    return this.derive(toHardenedIndex(index));
  }

  public derivePath(path: string): Bip32Node {
    const normalized = path.trim();
    assert(normalized.length > 0, 'Path must not be empty');

    let segments = normalized.split('/');
    const root = segments[0];

    if (root === 'm' || root === 'M') {
      assert(this.depth === 0, 'Absolute paths can only be derived from a master node');
      segments = segments.slice(1);
    }

    return segments.reduce((node, segment) => {
      if (segment === '') {
        return node;
      }

      return node.derive(parsePathIndex(segment, HARDENED_OFFSET));
    }, this as Bip32Node);
  }

  public toXprv(): string {
    assert(this.privateKey !== undefined, 'Cannot serialize a public-only node as xprv');
    const version = VERSIONS[this.network].private;
    const keyData = bytesConcat(new Uint8Array([0]), this.privateKey);
    return this.serialize(version, keyData);
  }

  public toXpub(): string {
    const version = VERSIONS[this.network].public;
    return this.serialize(version, this.publicKey);
  }

  private serialize(version: number, keyData: Uint8Array): string {
    const payload = new Uint8Array(78);
    payload.set(uint32ToBytes(version), 0);
    payload[4] = this.depth;
    payload.set(uint32ToBytes(this.parentFingerprint), 5);
    payload.set(uint32ToBytes(this.childNumber), 9);
    payload.set(this.chainCode, 13);
    payload.set(keyData, 45);

    return encodeBase58Check(payload);
  }

  private derivePrivateChild(index: number): Bip32Node {
    assert(this.privateKey !== undefined, 'Cannot derive private child without private key');

    const isHardened = isHardenedIndex(index);

    const data = isHardened
      ? // Check whether i >= 2^31 (hardened key)
        // Hardened child: let I = HMAC-SHA512(Key = c_par, Data = 0x00 || ser256(k_par) || ser32(i))
        // c_par = chain code parent, k_par = private key parent
        // 0x00 prefix is to make the len of private key consistent with public key len
        bytesConcat(new Uint8Array([0]), this.privateKey, uint32ToBytes(index))
      : // Normal child: let I = HMAC-SHA512(Key = c_par, Data = serP(point(k_par)) || ser32(i))
        // point(k_par) = public key parent derived from private key parent
        // point(p) = p * G

        // Compressed public key (33 bytes): 1 byte parity prefix (0x02/0x03) + 32 bytes x-coordinate
        // The curve is symmetric around the x-axis, so x and parity uniquely identify the point
        bytesConcat(this.publicKey, uint32ToBytes(index));

    const I = hmac(
      sha512,
      this.chainCode, // key
      data, // message
    );

    const [IL, IR] = splitHmac512(I);
    const left = bytesToBigInt(IL);

    assert(left < SECP256K1_ORDER, 'Invalid child key (I_L >= n)');

    const parent = bytesToBigInt(this.privateKey);

    // k_child = hmac(parent chain code, parent private key) + parent private key
    const child = (left + parent) % SECP256K1_ORDER;

    assert(child !== 0n, 'Invalid child key (k_i = 0)');

    const privateKey = bigIntToBytes(child, 32);
    const publicKey = secp256k1.getPublicKey(privateKey, true);

    return new Bip32Node({
      privateKey,
      publicKey,
      chainCode: IR,
      depth: this.depth + 1,
      parentFingerprint: this.getFingerprint(),
      childNumber: index,
      network: this.network,
    });
  }

  private derivePublicChild(index: number): Bip32Node {
    assert(!isHardenedIndex(index), 'Cannot derive hardened child from public key');

    const data = bytesConcat(this.publicKey, uint32ToBytes(index));
    const I = hmac(
      sha512,
      this.chainCode, // key
      data, // message
    );
    const [IL, IR] = splitHmac512(I);
    const left = bytesToBigInt(IL);

    assert(left < SECP256K1_ORDER, 'Invalid child key (I_L >= n)');

    const parentPoint = secp256k1.Point.fromBytes(this.publicKey);
    // The returned child pulbic key is point(parse256(IL)) + Kpar.
    // Kpar = public key parent point
    const childPoint = secp256k1.Point.BASE.multiply(left).add(parentPoint);

    assert(!childPoint.equals(secp256k1.Point.ZERO), 'Invalid child key (point at infinity)');

    return new Bip32Node({
      publicKey: childPoint.toBytes(true),
      chainCode: IR,
      depth: this.depth + 1,
      parentFingerprint: this.getFingerprint(),
      childNumber: index,
      network: this.network,
    });
  }
}

export const masterFromSeed = (opts: {
  seed: Uint8Array_;
  network?: Bip32Network;
  masterSecret?: Bip32MasterSecret;
}): Bip32Node => {
  const { seed, network, masterSecret } = opts;

  return Bip32Node.fromSeed({ seed, network, masterSecret });
};

export const parseExtendedKey = (base58: string): Bip32Node => {
  return Bip32Node.fromExtendedKey(base58);
};
