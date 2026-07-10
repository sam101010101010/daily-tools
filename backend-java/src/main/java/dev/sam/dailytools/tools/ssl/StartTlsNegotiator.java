package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Performs the plaintext STARTTLS upgrade dialogue for mail protocols, then hands the SAME socket
 * back so the caller can layer TLS over it. It does NOT do the TLS handshake itself.
 *
 * <p>Reads strictly one byte at a time (never a buffered reader): a buffered read could pull the
 * server's TLS ClientHello bytes off the wire along with the final {@code 220}/{@code OK} line,
 * corrupting the handshake that T6 layers on top.
 */
public final class StartTlsNegotiator {

  private StartTlsNegotiator() {}

  public static Socket negotiate(Socket plain, String startTls) throws IOException {
    String proto = startTls == null ? "none" : startTls.toLowerCase(Locale.ROOT);
    switch (proto) {
      case "none":
        return plain; // implicit TLS: T6 layers TLS directly on the plain socket
      case "smtp":
        smtp(plain);
        return plain;
      case "imap":
        imap(plain);
        return plain;
      case "pop3":
        pop3(plain);
        return plain;
      default:
        // Unknown value is rejected upstream (T6) as VALIDATION_ERROR; guard defensively anyway.
        throw new ToolException("VALIDATION_ERROR", "未知的 STARTTLS 协议：" + startTls);
    }
  }

  private static void smtp(Socket s) throws IOException {
    InputStream in = s.getInputStream();
    OutputStream out = s.getOutputStream();
    readReply(in, "220"); // service greeting
    send(out, "EHLO daily-tools\r\n");
    readReply(in, "250"); // EHLO response (advertises 250-STARTTLS)
    send(out, "STARTTLS\r\n");
    readReply(in, "220"); // ready to start TLS
  }

  private static void imap(Socket s) throws IOException {
    InputStream in = s.getInputStream();
    OutputStream out = s.getOutputStream();
    expect(in, "* OK"); // greeting
    send(out, "a STARTTLS\r\n");
    expect(in, "a OK"); // begin TLS negotiation
  }

  private static void pop3(Socket s) throws IOException {
    InputStream in = s.getInputStream();
    OutputStream out = s.getOutputStream();
    expect(in, "+OK"); // greeting
    send(out, "STLS\r\n");
    expect(in, "+OK"); // begin TLS negotiation
  }

  private static void send(OutputStream out, String command) throws IOException {
    out.write(command.getBytes(StandardCharsets.US_ASCII));
    out.flush();
  }

  /** SMTP-style reply: one or more lines all sharing {@code code}, continuation lines use "code-". */
  private static void readReply(InputStream in, String code) throws IOException {
    while (true) {
      String line = readLine(in);
      if (!line.startsWith(code)) {
        throw refused(line);
      }
      if (line.length() < 4 || line.charAt(3) != '-') {
        return; // final line ("code " or bare "code")
      }
    }
  }

  /** Single-line reply that must start with {@code prefix} (IMAP/POP3). */
  private static void expect(InputStream in, String prefix) throws IOException {
    String line = readLine(in);
    if (!line.startsWith(prefix)) {
      throw refused(line);
    }
  }

  private static ToolException refused(String line) {
    return new ToolException("SSL_HANDSHAKE_FAILED", "STARTTLS 协商失败：" + line);
  }

  private static String readLine(InputStream in) throws IOException {
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    int b;
    while ((b = in.read()) != -1) {
      if (b == '\n') {
        return buf.toString(StandardCharsets.US_ASCII);
      }
      if (b != '\r') {
        buf.write(b);
      }
    }
    if (buf.size() == 0) {
      throw new IOException("STARTTLS：连接在协商期间被关闭");
    }
    return buf.toString(StandardCharsets.US_ASCII);
  }
}
