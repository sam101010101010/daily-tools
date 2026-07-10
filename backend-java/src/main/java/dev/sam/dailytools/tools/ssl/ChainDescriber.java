package dev.sam.dailytools.tools.ssl;

import javax.naming.InvalidNameException;
import javax.naming.ldap.LdapName;
import javax.naming.ldap.Rdn;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Turns a single {@link X509Certificate} into a {@link CertDetail}: CN/O extracted from the DN
 * (raw DN preserved), validity window, key type + size, signature algorithm (with a weak-algorithm
 * flag), SHA-256 fingerprint, serial, and SANs. Total function — malformed fields degrade to null
 * rather than throwing (a bad cert is data to report, not a 500).
 */
public final class ChainDescriber {

  private ChainDescriber() {}

  public static CertDetail describe(X509Certificate cert) {
    String subjectDN = cert.getSubjectX500Principal().getName();
    String issuerDN = cert.getIssuerX500Principal().getName();

    Instant notAfter = cert.getNotAfter().toInstant();
    Instant now = Instant.now();

    return new CertDetail(
        rdn(subjectDN, "CN"),
        rdn(subjectDN, "O"),
        rdn(issuerDN, "CN"),
        rdn(issuerDN, "O"),
        subjectDN,
        issuerDN,
        cert.getNotBefore().toInstant().toString(),
        notAfter.toString(),
        now.isAfter(notAfter),
        Duration.between(now, notAfter).toDays(),
        cert.getPublicKey().getAlgorithm(),
        keySize(cert),
        cert.getSigAlgName(),
        isWeakSignature(cert.getSigAlgName()),
        sha256Fingerprint(cert),
        cert.getSerialNumber().toString(),
        sans(cert));
  }

  /** First value of RDN {@code type} (e.g. CN / O) in {@code dn}, or null if absent/malformed. */
  static String rdn(String dn, String type) {
    try {
      for (Rdn rdn : new LdapName(dn).getRdns()) {
        if (rdn.getType().equalsIgnoreCase(type)) {
          return String.valueOf(rdn.getValue());
        }
      }
    } catch (InvalidNameException ignored) {
      // malformed DN — fall through to null, raw DN is preserved on the record
    }
    return null;
  }

  private static Integer keySize(X509Certificate cert) {
    var key = cert.getPublicKey();
    if (key instanceof RSAPublicKey rsa) {
      return rsa.getModulus().bitLength();
    }
    if (key instanceof ECPublicKey ec) {
      return ec.getParams().getCurve().getField().getFieldSize();
    }
    return null;
  }

  /** SHA1/MD5-family signatures are weak (case-insensitive, hyphen-agnostic prefix match). */
  private static boolean isWeakSignature(String sigAlg) {
    if (sigAlg == null) {
      return false;
    }
    String s = sigAlg.toUpperCase(Locale.ROOT).replace("-", "");
    return s.startsWith("SHA1") || s.startsWith("MD5");
  }

  private static String sha256Fingerprint(X509Certificate cert) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(cert.getEncoded());
      StringBuilder sb = new StringBuilder(digest.length * 3);
      for (byte b : digest) {
        if (sb.length() > 0) {
          sb.append(':');
        }
        sb.append(String.format("%02X", b));
      }
      return sb.toString();
    } catch (GeneralSecurityException e) {
      return null;
    }
  }

  private static List<String> sans(X509Certificate cert) {
    List<String> sans = new ArrayList<>();
    try {
      var entries = cert.getSubjectAlternativeNames();
      if (entries != null) {
        for (List<?> e : entries) {
          if (e.size() >= 2) {
            sans.add(String.valueOf(e.get(1)));
          }
        }
      }
    } catch (Exception ignored) {
      // parsing failure — report an empty SAN list rather than failing the whole describe
    }
    return sans;
  }
}
