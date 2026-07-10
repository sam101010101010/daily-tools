package dev.sam.dailytools.tools.ssl;

import java.util.List;

/**
 * The full diagnostic result for one target: the negotiated protocol/cipher of the main handshake,
 * the TLS version support matrix, a bystander validation verdict (never blocks), and every
 * certificate in the presented chain (leaf first). Replaces the old leaf-only {@code SslCertInfo}.
 */
public record SslReport(
    String host,
    int port,
    String startTls,
    Negotiated negotiated,
    List<ProtocolProber.ProtocolResult> supportedProtocols,
    Validation validation,
    List<CertDetail> chain) {

  /** What the main handshake actually negotiated. */
  public record Negotiated(String version, String cipher) {}

  /** Bystander verdict — trust (platform CA store), hostname (RFC6125), self-signed, expiry. */
  public record Validation(
      boolean trusted,
      String trustError,
      boolean hostnameMatch,
      String matchedName,
      boolean selfSigned,
      boolean expired,
      long daysUntilExpiry) {}
}
