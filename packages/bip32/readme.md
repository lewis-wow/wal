# BIP32

## 1. BIP39: Mnemonic Phrase (Seed)

`apple banana cherry ...` -> Master Seed

## 2. BIP32: Hierarchical Derivation (Key Tree)

### Normal Derivation (`m/0/1`)

- **Feature:** Allows deriving public keys and addresses without needing the parent private key.
- **The Tweak (p):** p = HMAC-SHA512(Parent Chain Code, Parent Public Key || Index)
- **The Risk:** Attacker can calculate p from public information, obtaining a single child private key (d_child) allows to recover the parent private key (d_parent):
  d_parent = (d_child - p) mod n
  This compromises the entire branch of the wallet.

### Hardened Derivation (`m/44'`)

- **Feature:** The link between parent and child is mathematically broken for anyone without the parent private key.
- **The Tweak (p):** p = HMAC-SHA512(Parent Chain Code, 0x00 || d_parent || Index)
- **The Mathematical Deadlock:** To recover the parent private key from a leaked child key, an attacker would need the following equation:
  d_parent = (d_child - p) mod n
  However, unlike in normal derivation, the attacker **cannot calculate p** because it requires d_parent as an input for the HMAC function.
- **Benefit:** A leak of a child private key does not compromise the parent private key or any other branches of the tree.
