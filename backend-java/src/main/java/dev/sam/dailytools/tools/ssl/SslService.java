package dev.sam.dailytools.tools.ssl;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class SslService {

  public SslCertInfo inspect(String host, int port) {
    SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
    try (SSLSocket socket = (SSLSocket) factory.createSocket()) {
      socket.connect(new InetSocketAddress(host, port), 5000);
      socket.setSoTimeout(5000);
      socket.startHandshake();
      Certificate[] chain = socket.getSession().getPeerCertificates();
      return describe((X509Certificate) chain[0]);
    } catch (IOException e) {
      throw new ToolException("SSL_HANDSHAKE_FAILED", "无法连接或握手失败：" + host + ":" + port);
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
