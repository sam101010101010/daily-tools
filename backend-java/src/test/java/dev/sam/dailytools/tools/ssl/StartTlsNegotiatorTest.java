package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link StartTlsNegotiator} against scripted localhost mail servers. The negotiator
 * only performs the plaintext upgrade dialogue and hands the SAME socket back for T6 to layer TLS
 * over — so tests assert socket identity and the exact commands emitted.
 */
class StartTlsNegotiatorTest {

  private static final InetAddress LOOPBACK = InetAddress.getLoopbackAddress();

  @FunctionalInterface
  interface Script {
    void run(InputStream in, OutputStream out, List<String> received) throws IOException;
  }

  private record Server(ServerSocket socket, List<String> received, Thread thread)
      implements AutoCloseable {
    int port() {
      return socket.getLocalPort();
    }

    @Override
    public void close() throws IOException {
      socket.close();
    }
  }

  private static Server startServer(Script script) throws IOException {
    ServerSocket server = new ServerSocket(0, 1, LOOPBACK);
    List<String> received = Collections.synchronizedList(new ArrayList<>());
    Thread t = new Thread(() -> {
      try (Socket s = server.accept()) {
        script.run(s.getInputStream(), s.getOutputStream(), received);
      } catch (IOException ignored) {
        // client disconnected / expected failure path
      }
    });
    t.setDaemon(true);
    t.start();
    return new Server(server, received, t);
  }

  private static void write(OutputStream out, String s) throws IOException {
    out.write(s.getBytes(StandardCharsets.US_ASCII));
    out.flush();
  }

  private static String readCmd(InputStream in) throws IOException {
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    int b;
    while ((b = in.read()) != -1) {
      if (b == '\n') break;
      if (b != '\r') buf.write(b);
    }
    return buf.toString(StandardCharsets.US_ASCII);
  }

  @Test
  void smtp_sends_ehlo_and_starttls_then_returns_the_same_socket() throws Exception {
    Script smtp = (in, out, received) -> {
      write(out, "220 smtp.test ESMTP\r\n");
      received.add(readCmd(in));
      write(out, "250-smtp.test\r\n250-STARTTLS\r\n250 HELP\r\n");
      received.add(readCmd(in));
      write(out, "220 ready to start TLS\r\n");
    };
    try (Server server = startServer(smtp);
        Socket plain = new Socket(LOOPBACK, server.port())) {
      Socket result = StartTlsNegotiator.negotiate(plain, "smtp");
      assertThat(result).isSameAs(plain);
      server.thread().join(2000);
      assertThat(server.received()).containsExactly("EHLO daily-tools", "STARTTLS");
    }
  }

  @Test
  void smtp_starttls_refusal_maps_to_handshake_failed() throws Exception {
    Script reject = (in, out, received) -> {
      write(out, "220 smtp.test ESMTP\r\n");
      received.add(readCmd(in)); // EHLO
      write(out, "250-smtp.test\r\n250 HELP\r\n");
      received.add(readCmd(in)); // STARTTLS
      write(out, "554 TLS not available\r\n");
    };
    try (Server server = startServer(reject);
        Socket plain = new Socket(LOOPBACK, server.port())) {
      assertThatThrownBy(() -> StartTlsNegotiator.negotiate(plain, "smtp"))
          .isInstanceOf(ToolException.class)
          .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("SSL_HANDSHAKE_FAILED"));
    }
  }

  @Test
  void none_returns_the_same_socket_without_any_io() throws Exception {
    try (Socket plain = new Socket()) { // unconnected: negotiate must not touch it
      Socket result = StartTlsNegotiator.negotiate(plain, "none");
      assertThat(result).isSameAs(plain);
      assertThat(plain.isConnected()).isFalse();
    }
  }

  @Test
  void imap_sends_tagged_starttls_and_returns_the_same_socket() throws Exception {
    Script imap = (in, out, received) -> {
      write(out, "* OK IMAP4rev1 ready\r\n");
      received.add(readCmd(in));
      write(out, "a OK begin TLS negotiation\r\n");
    };
    try (Server server = startServer(imap);
        Socket plain = new Socket(LOOPBACK, server.port())) {
      Socket result = StartTlsNegotiator.negotiate(plain, "imap");
      assertThat(result).isSameAs(plain);
      server.thread().join(2000);
      assertThat(server.received()).containsExactly("a STARTTLS");
    }
  }

  @Test
  void pop3_sends_stls_and_returns_the_same_socket() throws Exception {
    Script pop3 = (in, out, received) -> {
      write(out, "+OK POP3 server ready\r\n");
      received.add(readCmd(in));
      write(out, "+OK Begin TLS negotiation\r\n");
    };
    try (Server server = startServer(pop3);
        Socket plain = new Socket(LOOPBACK, server.port())) {
      Socket result = StartTlsNegotiator.negotiate(plain, "pop3");
      assertThat(result).isSameAs(plain);
      server.thread().join(2000);
      assertThat(server.received()).containsExactly("STLS");
    }
  }
}
