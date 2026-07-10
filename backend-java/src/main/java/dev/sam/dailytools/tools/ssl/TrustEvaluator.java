package dev.sam.dailytools.tools.ssl;

import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.cert.CertPathBuilderException;
import java.security.cert.CertPathValidatorException;
import java.security.cert.CertificateException;
import java.security.cert.CertificateExpiredException;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;

/**
 * Bystander trust check: validates the presented chain against the platform CA store using PKIX,
 * <em>without</em> installing a real TrustManager into the handshake — a bad cert is reported, not
 * rejected. Hostname is deliberately out of scope (that is {@link HostnameMatcher}). Produces a
 * verdict only: trusted / trustError / selfSigned / expired / daysUntilExpiry.
 */
public final class TrustEvaluator {

  private TrustEvaluator() {}

  /** Trust verdict for the presented chain; never blocks. */
  public record Trust(
      boolean trusted, String trustError, boolean selfSigned, boolean expired, long daysUntilExpiry) {}

  public static Trust evaluate(X509Certificate[] chain) {
    if (chain == null || chain.length == 0) {
      return new Trust(false, "未取得证书", false, false, 0);
    }
    X509Certificate leaf = chain[0];
    boolean selfSigned = leaf.getSubjectX500Principal().equals(leaf.getIssuerX500Principal());
    Instant notAfter = leaf.getNotAfter().toInstant();
    Instant now = Instant.now();
    boolean expired = now.isAfter(notAfter);
    long daysUntilExpiry = Duration.between(now, notAfter).toDays();

    try {
      X509TrustManager tm = platformTrustManager();
      // authType per plan: the leaf public-key algorithm (RSA / EC / DSA …). PKIX builds a path
      // through any presented intermediates to a trusted root and checks validity — not hostname.
      tm.checkServerTrusted(chain, leaf.getPublicKey().getAlgorithm());
      return new Trust(true, null, selfSigned, expired, daysUntilExpiry);
    } catch (CertificateException e) {
      return new Trust(false, classify(e, expired), selfSigned, expired, daysUntilExpiry);
    } catch (GeneralSecurityException e) {
      // trust manager could not be initialised — report generically, never leak the stack
      return new Trust(false, "证书校验失败", selfSigned, expired, daysUntilExpiry);
    }
  }

  private static X509TrustManager platformTrustManager() throws GeneralSecurityException {
    TrustManagerFactory tmf = TrustManagerFactory.getInstance("PKIX");
    tmf.init((KeyStore) null); // null KeyStore => the platform default CA trust store
    for (var tm : tmf.getTrustManagers()) {
      if (tm instanceof X509TrustManager x509) {
        return x509;
      }
    }
    throw new KeyStoreException("no X509TrustManager available");
  }

  /**
   * Human-readable, stack-free classification. Expiry wins (it is the actionable issue and is
   * computed independently of PKIX's report order for an untrusted-and-expired cert); otherwise a
   * path-building/validation failure is a broken chain; anything else is a generic failure.
   */
  private static String classify(CertificateException e, boolean leafExpired) {
    if (leafExpired
        || hasReason(e, CertPathValidatorException.BasicReason.EXPIRED)
        || hasCause(e, CertificateExpiredException.class)) {
      return "证书已过期";
    }
    if (hasCause(e, CertPathBuilderException.class) || hasCause(e, CertPathValidatorException.class)) {
      return "无法建立到受信任根的证书链";
    }
    return "证书校验失败";
  }

  private static boolean hasCause(Throwable e, Class<? extends Throwable> type) {
    for (Throwable t = e; t != null; t = t.getCause()) {
      if (type.isInstance(t)) {
        return true;
      }
    }
    return false;
  }

  private static boolean hasReason(Throwable e, CertPathValidatorException.Reason reason) {
    for (Throwable t = e; t != null; t = t.getCause()) {
      if (t instanceof CertPathValidatorException cpve && cpve.getReason() == reason) {
        return true;
      }
    }
    return false;
  }
}
