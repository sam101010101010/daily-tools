package dev.sam.dailytools.tools.ssl;

import java.security.cert.CertificateParsingException;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;

/**
 * RFC6125-style hostname verification against the leaf certificate: match {@code host} against the
 * DNS SANs (type 2), falling back to the subject CN when there are no SANs. Supports exact
 * (case-insensitive) match and a single left-most-label wildcard ({@code *.example.com} matches one
 * label, never a dot and never the bare apex). This is a bystander check — it never blocks; the
 * caller records {@code hostnameMatch}/{@code matchedName} on the report.
 */
public final class HostnameMatcher {

  private HostnameMatcher() {}

  /** Outcome of a match: whether any presented name matched, and which one. */
  public record Match(boolean match, String matchedName) {}

  private static final Match NO_MATCH = new Match(false, null);

  public static Match matches(String host, X509Certificate leaf) {
    if (host == null || leaf == null) {
      return NO_MATCH;
    }
    String h = host.toLowerCase(Locale.ROOT);
    for (String name : presentedNames(leaf)) {
      if (matchesName(h, name)) {
        return new Match(true, name);
      }
    }
    return NO_MATCH;
  }

  /** DNS SANs (GeneralName type 2); if the cert presents none, fall back to the subject CN. */
  private static List<String> presentedNames(X509Certificate leaf) {
    List<String> dnsSans = new ArrayList<>();
    try {
      Collection<List<?>> sans = leaf.getSubjectAlternativeNames();
      if (sans != null) {
        for (List<?> entry : sans) {
          if (entry.size() >= 2 && Integer.valueOf(2).equals(entry.get(0))) {
            dnsSans.add(String.valueOf(entry.get(1)));
          }
        }
      }
    } catch (CertificateParsingException ignored) {
      // treat an unparseable SAN extension as "no SANs" and fall back to CN
    }
    if (!dnsSans.isEmpty()) {
      return dnsSans;
    }
    String cn = ChainDescriber.rdn(leaf.getSubjectX500Principal().getName(), "CN");
    return cn == null ? List.of() : List.of(cn);
  }

  private static boolean matchesName(String host, String certName) {
    if (certName == null) {
      return false;
    }
    String name = certName.toLowerCase(Locale.ROOT);
    if (name.equals(host)) {
      return true;
    }
    if (name.startsWith("*.")) {
      String suffix = name.substring(1); // e.g. ".example.com"
      if (host.endsWith(suffix)) {
        String leftLabel = host.substring(0, host.length() - suffix.length());
        // exactly one non-empty label, no embedded dot, and never the bare apex
        return !leftLabel.isEmpty() && leftLabel.indexOf('.') < 0;
      }
    }
    return false;
  }
}
