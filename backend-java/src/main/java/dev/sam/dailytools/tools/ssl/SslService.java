package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.UnknownHostException;
import java.security.GeneralSecurityException;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.List;

@Service
public class SslService {

  public SslCertInfo inspect(String host, int port) {
    // SSRF guard: resolve up front, reject internal targets, then connect to the very
    // address we validated (never re-resolve — that would reopen the hole we just closed).
    InetAddress target = resolveAndGuard(host);
    try (SSLSocket socket = createTrustAllSocket()) {
      socket.connect(new InetSocketAddress(target, port), 5000);
      socket.setSoTimeout(5000);

      SSLParameters params = socket.getSSLParameters();
      params.setServerNames(List.of(new SNIHostName(host)));
      socket.setSSLParameters(params);

      socket.startHandshake();
      Certificate[] chain = socket.getSession().getPeerCertificates();
      // Interim: the tool still returns the leaf as SslCertInfo; T6 rewrites inspect() to build
      // the full SslReport (whole chain + verdict + protocol matrix) from ChainDescriber & friends.
      CertDetail leaf = ChainDescriber.describe((X509Certificate) chain[0]);
      return new SslCertInfo(
          leaf.subjectDN(), leaf.issuerDN(), leaf.notBefore(), leaf.notAfter(),
          leaf.expired(), leaf.daysUntilExpiry(), leaf.sans(), leaf.serialNumber());
    } catch (IOException e) {
      throw new ToolException("SSL_HANDSHAKE_FAILED", "无法连接或握手失败：" + host + ":" + port);
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

  private SSLSocket createTrustAllSocket() {
    try {
      return (SSLSocket) TrustAll.socketFactory().createSocket();
    } catch (GeneralSecurityException | IOException e) {
      throw new ToolException("SSL_HANDSHAKE_FAILED", "无法初始化 SSL 上下文：" + e.getMessage());
    }
  }
}
