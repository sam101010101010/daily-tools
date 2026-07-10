package dev.sam.dailytools.tools.ssl;

import javax.net.ssl.SSLSocket;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.List;

/**
 * Probes which TLS versions a target will negotiate, one trust-all handshake per protocol. The
 * result reflects what THIS client can negotiate with the server; {@code weak} is a static property
 * of the protocol (TLSv1 / TLSv1.1), independent of whether it was supported.
 *
 * <p>Takes an already-resolved {@link InetAddress} — the SSRF guard runs once in the orchestration
 * layer ({@code SslService}); this prober must never re-resolve the host.
 */
public final class ProtocolProber {

  private ProtocolProber() {}

  private static final String[] PROTOCOLS = {"TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"};
  private static final int TIMEOUT_MS = 5000;

  /** One row of the version matrix. */
  public record ProtocolResult(String protocol, boolean supported, boolean weak) {}

  public static List<ProtocolResult> probe(InetAddress addr, int port) {
    List<ProtocolResult> results = new ArrayList<>(PROTOCOLS.length);
    for (String protocol : PROTOCOLS) {
      boolean weak = protocol.equals("TLSv1") || protocol.equals("TLSv1.1");
      results.add(new ProtocolResult(protocol, supportsProtocol(addr, port, protocol), weak));
    }
    return results;
  }

  private static boolean supportsProtocol(InetAddress addr, int port, String protocol) {
    try (SSLSocket socket = (SSLSocket) TrustAll.socketFactory().createSocket()) {
      socket.setEnabledProtocols(new String[] {protocol});
      socket.connect(new InetSocketAddress(addr, port), TIMEOUT_MS);
      socket.setSoTimeout(TIMEOUT_MS);
      socket.startHandshake();
      return true;
    } catch (IllegalArgumentException | IOException | GeneralSecurityException e) {
      // IllegalArgumentException: protocol disabled by jdk.tls.disabledAlgorithms (this client
      //   cannot even offer it — e.g. TLSv1/1.1 on stock JDK 21);
      // IOException: TCP or handshake failure (server does not speak this protocol);
      // GeneralSecurityException: trust-all factory init failure.
      // All mean "not negotiable" — a best-effort probe never bubbles up.
      return false;
    }
  }
}
