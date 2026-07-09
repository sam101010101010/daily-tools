package dev.sam.dailytools.tools.crypto;

/**
 * Named "magic keyword" presets (ADR-0007 D7). A preset bundles a passphrase with a fixed
 * mode/padding/keyHash so a caller can reproduce a legacy system's scheme by name — without ever
 * handling the key. The passphrase lives only in this backend process (injected via an environment
 * variable at lookup time); it is never hard-coded in the repo, an image layer, or any response
 * sent to the frontend.
 *
 * <p>Adding a preset exposes a new built-in key over the network and must be re-reviewed per preset
 * (Tier A). Today the only preset is {@code tapdata}.
 */
public final class CryptoPresets {
  private CryptoPresets() {}

  public record Preset(String passphrase, String keyHash, String mode, String padding) {}

  /**
   * Resolve a preset by name, reading its passphrase from the environment at call time. Returns
   * {@code null} for an unknown name, or for a known preset whose passphrase env var is unset — the
   * caller maps either to {@code VALIDATION_ERROR}, so an unconfigured preset is simply unavailable.
   */
  public static Preset get(String name) {
    if ("tapdata".equals(name)) {
      // tapdata AES256Util: MD5(KEY) -> AES-128/ECB/PKCS5Padding. KEY is the passphrase.
      String passphrase = System.getenv("CRYPTO_PRESET_TAPDATA_KEY");
      if (passphrase == null || passphrase.isEmpty()) {
        return null;
      }
      return new Preset(passphrase, "MD5", "ECB", "PKCS5Padding");
    }
    return null;
  }
}
