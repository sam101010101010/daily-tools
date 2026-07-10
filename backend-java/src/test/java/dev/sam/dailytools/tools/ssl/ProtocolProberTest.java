package dev.sam.dailytools.tools.ssl;

import org.junit.jupiter.api.Test;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLServerSocketFactory;
import javax.net.ssl.SSLSocket;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.security.KeyStore;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test for {@link ProtocolProber} against a real localhost {@code SSLServerSocket} configured
 * to accept TLSv1.2 only. Offline by construction — the prober takes an already-resolved address
 * (the SSRF guard lives in the T6 orchestration layer), so connecting to 127.0.0.1 is fine here.
 */
class ProtocolProberTest {

  private static SSLContext serverContext() throws Exception {
    KeyStore ks = KeyStore.getInstance("PKCS12");
    try (InputStream in = ProtocolProberTest.class.getResourceAsStream("/ssl/server.p12")) {
      ks.load(in, "changeit".toCharArray());
    }
    KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
    kmf.init(ks, "changeit".toCharArray());
    SSLContext ctx = SSLContext.getInstance("TLS");
    ctx.init(kmf.getKeyManagers(), null, null);
    return ctx;
  }

  private static ProtocolProber.ProtocolResult row(List<ProtocolProber.ProtocolResult> rows, String p) {
    return rows.stream().filter(r -> r.protocol().equals(p)).findFirst().orElseThrow();
  }

  @Test
  void probe_reports_supported_matrix_and_static_weak_flags() throws Exception {
    SSLServerSocketFactory ssf = serverContext().getServerSocketFactory();
    InetAddress loopback = InetAddress.getLoopbackAddress();
    try (SSLServerSocket server =
        (SSLServerSocket) ssf.createServerSocket(0, 4, loopback)) {
      server.setEnabledProtocols(new String[] {"TLSv1.2"});
      int port = server.getLocalPort();

      Thread acceptor = new Thread(() -> {
        while (true) {
          try (SSLSocket s = (SSLSocket) server.accept()) {
            s.startHandshake();
          } catch (IOException handshakeOrClosed) {
            if (server.isClosed()) {
              return;
            }
            // a probe that offered an unsupported protocol — keep serving the next one
          }
        }
      });
      acceptor.setDaemon(true);
      acceptor.start();

      List<ProtocolProber.ProtocolResult> rows = ProtocolProber.probe(loopback, port);

      assertThat(rows).extracting(ProtocolProber.ProtocolResult::protocol)
          .containsExactly("TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3");

      // supported matrix: server speaks only TLSv1.2
      assertThat(row(rows, "TLSv1.2").supported()).isTrue();
      assertThat(row(rows, "TLSv1.3").supported()).isFalse();

      // weak is a static property of the protocol, independent of supported
      assertThat(row(rows, "TLSv1").weak()).isTrue();
      assertThat(row(rows, "TLSv1.1").weak()).isTrue();
      assertThat(row(rows, "TLSv1.2").weak()).isFalse();
      assertThat(row(rows, "TLSv1.3").weak()).isFalse();
    }
  }
}
