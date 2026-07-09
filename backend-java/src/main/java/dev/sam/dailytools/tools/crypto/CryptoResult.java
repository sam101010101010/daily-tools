package dev.sam.dailytools.tools.crypto;

/**
 * Result of a crypto transform. {@code output} is the transformed payload encoded per the request's
 * {@code outputEnc}; {@code iv} echoes the IV actually used (empty string for ECB), so the caller can
 * copy it for a later decrypt.
 */
public record CryptoResult(String output, String iv) {}
