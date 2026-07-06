package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.security.GeneralSecurityException;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class SslService {

  /**
   * This inspector is a diagnostic tool: its job is to read and report whatever certificate a
   * server presents (including expired / self-signed / mismatched ones), not to establish a
   * secure channel. A trust-all TrustManager is therefore built and scoped to a single socket
   * here — it is never installed as the JVM/global default and must not affect any other
   * outbound TLS in the process.
   */
  private static final X509TrustManager TRUST_ALL =
      new X509TrustManager() {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) { }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) { }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
          return new X509Certificate[0];
        }
      };

  public SslCertInfo inspect(String host, int port) {
    try (SSLSocket socket = createTrustAllSocket()) {
      socket.connect(new InetSocketAddress(host, port), 5000);
      socket.setSoTimeout(5000);

      SSLParameters params = socket.getSSLParameters();
      params.setServerNames(List.of(new SNIHostName(host)));
      socket.setSSLParameters(params);

      socket.startHandshake();
      Certificate[] chain = socket.getSession().getPeerCertificates();
      return describe((X509Certificate) chain[0]);
    } catch (IOException e) {
      throw new ToolException("SSL_HANDSHAKE_FAILED", "无法连接或握手失败：" + host + ":" + port);
    }
  }

  private SSLSocket createTrustAllSocket() {
    try {
      SSLContext context = SSLContext.getInstance("TLS");
      context.init(null, new TrustManager[] {TRUST_ALL}, null);
      SSLSocketFactory factory = context.getSocketFactory();
      return (SSLSocket) factory.createSocket();
    } catch (GeneralSecurityException | IOException e) {
      throw new ToolException("SSL_HANDSHAKE_FAILED", "无法初始化 SSL 上下文：" + e.getMessage());
    }
  }

  SslCertInfo describe(X509Certificate cert) {
    Instant notAfter = cert.getNotAfter().toInstant();
    long days = Duration.between(Instant.now(), notAfter).toDays();
    List<String> sans = new ArrayList<>();
    try {
      var entries = cert.getSubjectAlternativeNames();
      if (entries != null) for (List<?> e : entries) if (e.size() >= 2) sans.add(String.valueOf(e.get(1)));
    } catch (Exception ignored) { }
    return new SslCertInfo(
        cert.getSubjectX500Principal().getName(),
        cert.getIssuerX500Principal().getName(),
        cert.getNotBefore().toInstant().toString(),
        notAfter.toString(),
        Instant.now().isAfter(notAfter),
        days,
        sans,
        cert.getSerialNumber().toString());
  }
}
