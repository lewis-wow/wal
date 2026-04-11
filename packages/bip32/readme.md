# BIP32

## N(CKDpriv) == CKDpub

Deriving a child public key from its private key is equivalent to deriving it directly from the parent public key. This property holds only for non-hardened child derivations. For hardened derivations, the parent private key is strictly required to compute I via HMAC-SHA512, which prevents the derivation of child keys from a public key alone.

Normal public keys can be derived from a parent xpub without knowing the parent xpriv. Normal private keys can then be generated from the parent xpriv, corresponding to the K_i values generated in the previous step.

Symbols:

- G = Base point of the curve
- k_par = Parent private key (integer)
- K_par = Parent public key (k_par \* G)
- I_L = Left 32 bytes of HMAC-SHA512(key=c_par, data=K_par || i) (non-hardened derivation)
- n = Order of the curve

1. Deriving Child Private Key (k_i):
   k_i = (I_L + k_par) mod n

2. Deriving Child Public Key from k\*i:
   K_i = k_i \* G
   K_i = (I_L + k_par) \* G

3. Applying Distributive Law:
   K_i = (I_L \* G) + (k_par \* G)

4. Substitution:
   Since K_par = k_par \* G, we can rewrite it as:
   K_i = (I_L \* G) + K_par

5. We can compute K_i (child public key) either by adding I_L to k_par first (private way),
   or by adding (I_L \* G) to K_par directly (public way).
   Both paths lead to the same point on the curve.

## 1. BIP39: Mnemonic Phrase (Seed)

`apple banana cherry ...` -> Master Seed

## 2. BIP32: Hierarchical Derivation (Key Tree)

### Normal Derivation (`m/0/1`)

- **Feature:** Allows deriving public keys and addresses without needing the parent private key.
- **The Tweak (p):** p = HMAC-SHA512(Parent Chain Code, Parent Public Key || Index)
- **The Risk:** Attacker can calculate p from public information, obtaining a single child private key (d_child) allows to recover the parent private key (d_parent):
  d_parent = (d_child - p) mod n
  This compromises the entire branch of the wallet.
  The attacker MUST know the Parent Chain Code, which is a XPUB info, not on the blockchain.

### Hardened Derivation (`m/44'`)

- **Feature:** The link between parent and child is mathematically broken for anyone without the parent private key.
- **The Tweak (p):** p = HMAC-SHA512(Parent Chain Code, 0x00 || d_parent || Index)
- **The Mathematical Deadlock:** To recover the parent private key from a leaked child key, an attacker would need the following equation:
  d_parent = (d_child - p) mod n
  However, unlike in normal derivation, the attacker **cannot calculate p** because it requires d_parent as an input for the HMAC function.
- **Benefit:** A leak of a child private key does not compromise the parent private key or any other branches of the tree.
