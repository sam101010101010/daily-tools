package dev.sam.dailytools.tools.whois;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.sam.dailytools.common.ToolException;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public class RdapBootstrapResolver {
  public static final URI IANA_DNS_BOOTSTRAP = URI.create("https://data.iana.org/rdap/dns.json");
  private static final Duration CACHE_TTL = Duration.ofHours(24);
  private static final String LOOKUP_FAILURE = "RDAP 服务发现失败，请稍后重试";

  private final RdapHttpClient client;
  private final Clock clock;
  private final ObjectMapper mapper = new ObjectMapper();
  private List<Service> cachedServices;
  private Instant expiresAt = Instant.EPOCH;

  public RdapBootstrapResolver(RdapHttpClient client, Clock clock) {
    this.client = client;
    this.clock = clock;
  }

  public URI baseUrlFor(String normalizedDomain) {
    String domain = normalizedDomain.toLowerCase(Locale.ROOT);
    return services().stream()
        .filter(service -> domain.equals(service.tld()) || domain.endsWith("." + service.tld()))
        .max(Comparator.comparingInt(service -> service.tld().length()))
        .map(Service::baseUrl)
        .orElseThrow(RdapBootstrapResolver::lookupFailure);
  }

  private synchronized List<Service> services() {
    if (cachedServices != null && clock.instant().isBefore(expiresAt)) {
      return cachedServices;
    }
    RdapHttpResponse response;
    try {
      response = client.get(IANA_DNS_BOOTSTRAP);
    } catch (RuntimeException error) {
      throw lookupFailure();
    }
    if (response == null || response.status() != 200 || response.body() == null) {
      throw lookupFailure();
    }
    List<Service> loaded = parseServices(response.body());
    cachedServices = List.copyOf(loaded);
    expiresAt = clock.instant().plus(CACHE_TTL);
    return cachedServices;
  }

  private List<Service> parseServices(String body) {
    try {
      JsonNode services = mapper.readTree(body).path("services");
      if (!services.isArray()) {
        throw lookupFailure();
      }
      List<Service> result = new ArrayList<>();
      for (JsonNode item : services) {
        if (!item.isArray() || item.size() != 2 || !item.get(0).isArray() || !item.get(1).isArray()) {
          throw lookupFailure();
        }
        List<String> tlds = new ArrayList<>();
        for (JsonNode tld : item.get(0)) {
          if (!tld.isTextual() || !validTld(tld.textValue())) {
            throw lookupFailure();
          }
          tlds.add(tld.textValue().toLowerCase(Locale.ROOT));
        }
        List<URI> urls = new ArrayList<>();
        for (JsonNode url : item.get(1)) {
          if (url.isTextual()) {
            authorityUrl(url.textValue()).ifPresent(urls::add);
          }
        }
        if (tlds.isEmpty() || urls.isEmpty()) {
          throw lookupFailure();
        }
        for (String tld : tlds) {
          for (URI url : urls) {
            result.add(new Service(tld, url));
          }
        }
      }
      if (result.isEmpty()) {
        throw lookupFailure();
      }
      return result;
    } catch (ToolException error) {
      throw error;
    } catch (Exception error) {
      throw lookupFailure();
    }
  }

  private static java.util.Optional<URI> authorityUrl(String raw) {
    try {
      URI parsed = new URI(raw);
      String host = parsed.getHost();
      if (!"https".equalsIgnoreCase(parsed.getScheme())
          || parsed.getUserInfo() != null
          || (parsed.getPort() != -1 && parsed.getPort() != 443)
          || host == null
          || host.matches("[0-9.]+")
          || host.contains(":")
          || parsed.getQuery() != null
          || parsed.getFragment() != null) {
        return java.util.Optional.empty();
      }
      String path = parsed.getPath();
      String normalizedPath = path == null || path.isEmpty() ? "/" : (path.endsWith("/") ? path : path + "/");
      return java.util.Optional.of(new URI("https", null, host, -1, normalizedPath, null, null));
    } catch (URISyntaxException error) {
      return java.util.Optional.empty();
    }
  }

  private static boolean validTld(String value) {
    return value.matches("[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*");
  }

  private static ToolException lookupFailure() {
    return new ToolException("RDAP_LOOKUP_FAILED", LOOKUP_FAILURE);
  }

  private record Service(String tld, URI baseUrl) {}
}
