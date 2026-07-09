package dev.sam.dailytools.tools.crypto;

/**
 * Shared request contract for {@code POST /api/java/crypto} (see the contract table in
 * {@code plans/m5-crypto.md}). All fields are strings so encoding is explicit; unused fields are
 * {@code null} for a given operation.
 */
public record CryptoRequest(
    String op,          // "encrypt" | "decrypt"
    String mode,        // "ECB" | "CBC" | "GCM"
    String padding,     // "PKCS5Padding" | "NoPadding" (GCM forces NoPadding)
    String keySource,   // "raw" | "hash" | "preset"
    String keyHash,     // "MD5" | "SHA-256" (keySource=hash only)
    String key,         // raw key bytes, or passphrase when keySource=hash
    String keyEnc,      // "utf8" | "hex" | "base64"
    String preset,      // named preset (keySource=preset only)
    String iv,          // CBC=16B, GCM=12B; ignored for ECB
    String ivEnc,       // "utf8" | "hex" | "base64"
    String input,       // plaintext (encrypt) or ciphertext (decrypt)
    String inputEnc,    // "utf8" | "hex" | "base64"
    String outputEnc) { // "utf8" | "hex" | "base64"
}
