package dev.sam.dailytools.tools.ssl;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.GeneralSecurityException;
import java.security.cert.X509Certificate;

/**
 * A trust-all client SSL factory, scoped to this inspector. It accepts any server certificate so
 * the tool can READ whatever a server presents (expired / self-signed / mismatched) — trust is
 * judged out-of-band by {@link TrustEvaluator}, never in the handshake. This TrustManager is never
 * installed as the JVM default and must not affect any other outbound TLS in the process.
 */
final class TrustAll {

  private TrustAll() {}

  static final X509TrustManager TRUST_MANAGER =
      new X509TrustManager() {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {}

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {}

        @Override
        public X509Certificate[] getAcceptedIssuers() {
          return new X509Certificate[0];
        }
      };

  static SSLSocketFactory socketFactory() throws GeneralSecurityException {
    SSLContext ctx = SSLContext.getInstance("TLS");
    ctx.init(null, new TrustManager[] {TRUST_MANAGER}, null);
    return ctx.getSocketFactory();
  }
}
