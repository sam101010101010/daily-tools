package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import java.net.IDN;
import java.net.URI;
import java.util.Locale;

@Service
public class WhoisService {
  private static final String VALIDATION_MESSAGE = "请输入合法的域名";
  private final RdapBootstrapResolver resolver;
  private final RdapHttpClient client;
  private final RdapDomainMapper mapper = new RdapDomainMapper();

  public WhoisService(RdapBootstrapResolver resolver, RdapHttpClient client) {
    this.resolver = resolver;
    this.client = client;
  }

  public RdapReport lookup(String input) {
    String domain = normalize(input);
    URI source = resolver.baseUrlFor(domain).resolve("domain/" + domain);
    RdapHttpResponse response;
    try {
      response = client.get(source);
    } catch (ToolException error) {
      throw error;
    } catch (RuntimeException error) {
      throw lookupFailure();
    }
    if (response == null) throw lookupFailure();
    if (response.status() == 404) return RdapReport.notFound(input, domain, source.toString());
    if (response.status() != 200 || response.body() == null) throw lookupFailure();
    return mapper.map(input, domain, source, response.body());
  }

  private static String normalize(String input) {
    if (input == null || input.isBlank() || !input.equals(input.trim())) throw validationFailure();
    String value = input.endsWith(".") ? input.substring(0, input.length() - 1) : input;
    try {
      String ascii = IDN.toASCII(value, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
      if (ascii.length() > 253 || !ascii.contains(".") || isIpv4(ascii)) throw validationFailure();
      for (String label : ascii.split("\\.", -1)) {
        if (!label.matches("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")) throw validationFailure();
      }
      return ascii;
    } catch (IllegalArgumentException error) {
      throw validationFailure();
    }
  }

  private static boolean isIpv4(String value) {
    return value.matches("\\d{1,3}(?:\\.\\d{1,3}){3}");
  }

  private static ToolException validationFailure() {
    return new ToolException("VALIDATION_ERROR", VALIDATION_MESSAGE);
  }

  private static ToolException lookupFailure() {
    return new ToolException("RDAP_LOOKUP_FAILED", "RDAP 查询暂时不可用，请稍后重试");
  }
}
