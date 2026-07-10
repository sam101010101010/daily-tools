package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.UnknownHostException;
import java.security.GeneralSecurityException;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class SslService {

  private static final Set<String> START_TLS = Set.of("none", "smtp", "imap", "pop3");
  private static final int CONNECT_TIMEOUT_MS = 5000;
  private static final int READ_TIMEOUT_MS = 5000;

  /**
   * Diagnose the TLS endpoint at {@code host:port}. Reads whatever the server presents — expired,
   * self-signed, or mismatched certs are reported in {@link SslReport#validation()}, never rejected
   * ({@link TrustEvaluator}/{@link HostnameMatcher} are bystanders). SSRF guard is applied once and
   * every connection (main handshake + protocol probes) reuses that validated address.
   */
  public SslReport inspect(String host, int port, String startTls) {
    if (port < 1 || port > 65535) {
      throw new ToolException("VALIDATION_ERROR", "端口超出范围（1–65535）：" + port);
    }
    String proto = startTls == null ? "none" : startTls.toLowerCase(Locale.ROOT);
    if (!START_TLS.contains(proto)) {
      throw new ToolException("VALIDATION_ERROR", "未知的 STARTTLS 协议：" + startTls);
    }

    // SSRF guard: resolve up front, reject internal targets, then connect to the very address we
    // validated (never re-resolve — that would reopen the hole we just closed). The same address
    // feeds the protocol prober below.
    InetAddress target = resolveAndGuard(host);

    try (Socket plain = new Socket()) {
      plain.connect(new InetSocketAddress(target, port), CONNECT_TIMEOUT_MS);
      plain.setSoTimeout(READ_TIMEOUT_MS);
      // Plaintext STARTTLS upgrade if requested; 'none' hands the same socket straight back.
      Socket upgraded = StartTlsNegotiator.negotiate(plain, proto);
      try (SSLSocket ssl =
          (SSLSocket) TrustAll.socketFactory().createSocket(upgraded, host, port, true)) {
        setSniIfHostname(ssl, host);
        ssl.startHandshake();
        SSLSession session = ssl.getSession();
        Certificate[] peer = session.getPeerCertificates();
        return assemble(host, port, proto, target, peer, session);
      }
    } catch (IOException | GeneralSecurityException e) {
      throw new ToolException("SSL_HANDSHAKE_FAILED", "无法连接或握手失败：" + host + ":" + port);
    }
  }

  private SslReport assemble(
      String host, int port, String startTls, InetAddress target, Certificate[] peer, SSLSession session) {
    X509Certificate[] x509 = new X509Certificate[peer.length];
    List<CertDetail> chain = new ArrayList<>(peer.length);
    for (int i = 0; i < peer.length; i++) {
      x509[i] = (X509Certificate) peer[i];
      chain.add(ChainDescriber.describe(x509[i]));
    }

    TrustEvaluator.Trust trust = TrustEvaluator.evaluate(x509);
    HostnameMatcher.Match match = HostnameMatcher.matches(host, x509[0]);
    SslReport.Validation validation = new SslReport.Validation(
        trust.trusted(), trust.trustError(), match.match(), match.matchedName(),
        trust.selfSigned(), trust.expired(), trust.daysUntilExpiry());

    SslReport.Negotiated negotiated =
        new SslReport.Negotiated(session.getProtocol(), session.getCipherSuite());
    List<ProtocolProber.ProtocolResult> matrix = ProtocolProber.probe(target, port);

    return new SslReport(host, port, startTls, negotiated, matrix, validation, chain);
  }

  /**
   * Set SNI to {@code host} unless it is an IP literal — {@link SNIHostName} rejects IPs with an
   * {@link IllegalArgumentException}, and an IP target legitimately carries no server name.
   */
  private void setSniIfHostname(SSLSocket ssl, String host) {
    try {
      SSLParameters params = ssl.getSSLParameters();
      params.setServerNames(List.of(new SNIHostName(host)));
      ssl.setSSLParameters(params);
    } catch (IllegalArgumentException ipLiteral) {
      // host is an IP literal — proceed without SNI
    }
  }

  /**
   * Resolve {@code host} and refuse to probe any target that lands on an internal address —
   * loopback, any-local, link-local (incl. the {@code 169.254.169.254} cloud-metadata IP),
   * RFC1918 private, multicast, or an IPv6 unique-local address. This is the SSRF fence: the
   * inspector will happily read whatever cert a *public* server presents, but must never be
   * turned into a probe of the host's own network. Returns the validated address to connect to.
   */
  private InetAddress resolveAndGuard(String host) {
    InetAddress[] addrs;
    try {
      addrs = InetAddress.getAllByName(host);
    } catch (UnknownHostException e) {
      throw new ToolException("SSL_HANDSHAKE_FAILED", "无法解析主机：" + host);
    }
    for (InetAddress a : addrs) {
      if (isBlocked(a)) {
        throw new ToolException("VALIDATION_ERROR", "禁止探测私有 / 环回 / 链路本地 / 元数据地址：" + host);
      }
    }
    return addrs[0];
  }

  static boolean isBlocked(InetAddress a) {
    if (a.isLoopbackAddress() || a.isAnyLocalAddress() || a.isLinkLocalAddress()
        || a.isSiteLocalAddress() || a.isMulticastAddress()) {
      return true;
    }
    byte[] b = a.getAddress();
    // IPv6 unique-local fc00::/7 — not covered by isSiteLocalAddress()
    return b.length == 16 && (b[0] & 0xfe) == 0xfc;
  }
}
