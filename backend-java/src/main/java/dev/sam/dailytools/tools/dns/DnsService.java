package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@Service
public class DnsService {
  static final List<String> FORWARD_TYPES = List.of(
      "A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "CAA", "SRV", "DS", "DNSKEY", "RRSIG");
  private static final int MAX_CONCURRENT_QUERIES = 4;

  private final DnsWireClient query;

  public DnsService(DnsWireClient query) {
    this.query = query;
  }

  public DnsReport resolve(String input, DnsResolverChoice requestedResolver) {
    long startedAt = System.nanoTime();
    QueryPlan plan = planFor(input);
    DnsResolverChoice resolver = DnsResolverChoice.defaultFor(requestedResolver);
    List<DnsQueryResult> queries = execute(plan, resolver);
    int respondedQueryCount = (int) queries.stream().filter(result -> result.rcode() != null).count();
    if (respondedQueryCount == 0) {
      throw new ToolException("DNS_LOOKUP_FAILED", "DNS 查询未收到任何协议响应");
    }
    return new DnsReport(input, resolver, elapsedMs(startedAt), queries.size(), respondedQueryCount, queries);
  }

  private List<DnsQueryResult> execute(QueryPlan plan, DnsResolverChoice resolver) {
    ExecutorService executor = Executors.newFixedThreadPool(Math.min(MAX_CONCURRENT_QUERIES, plan.types().size()));
    try {
      List<Callable<DnsQueryResult>> tasks = plan.types().stream()
          .<Callable<DnsQueryResult>>map(type -> () -> safeQuery(plan.queryName(), type, resolver))
          .toList();
      List<Future<DnsQueryResult>> futures = executor.invokeAll(tasks);
      List<DnsQueryResult> results = new ArrayList<>(futures.size());
      for (Future<DnsQueryResult> future : futures) {
        results.add(future.get());
      }
      return results;
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new ToolException("DNS_LOOKUP_FAILED", "DNS 查询被中断");
    } catch (ExecutionException exception) {
      throw new ToolException("DNS_LOOKUP_FAILED", "DNS 查询无法完成");
    } finally {
      executor.shutdownNow();
    }
  }

  private DnsQueryResult safeQuery(String queryName, String type, DnsResolverChoice resolver) {
    try {
      DnsQueryResult result = query.query(queryName, type, resolver);
      return result == null
          ? DnsQueryResult.transportError(queryName, type, 0, "DNS_TRANSPORT_ERROR", "DNS 查询未返回结果")
          : result;
    } catch (RuntimeException exception) {
      return DnsQueryResult.transportError(queryName, type, 0, "DNS_TRANSPORT_ERROR", "DNS 查询无法完成");
    }
  }

  private static QueryPlan planFor(String input) {
    if (input == null || input.isBlank() || !input.equals(input.trim())) {
      throw validationError();
    }
    if (isFourLabelNumericCandidate(input)) {
      if (!isIpv4Literal(input)) {
        throw validationError();
      }
      return new QueryPlan(reverseIpv4(input), List.of("PTR"));
    }
    if (input.matches("[0-9A-Fa-f:.]+") && input.contains(":")) {
      return new QueryPlan(reverseIpv6(input), List.of("PTR"));
    }
    if (!isHostname(input)) {
      throw validationError();
    }
    return new QueryPlan(input.endsWith(".") ? input : input + ".", FORWARD_TYPES);
  }

  private static String reverseIpv4(String input) {
    String[] octets = input.split("\\.", -1);
    int[] values = new int[4];
    for (int index = 0; index < octets.length; index++) {
      values[index] = Integer.parseInt(octets[index]);
    }
    return values[3] + "." + values[2] + "." + values[1] + "." + values[0] + ".in-addr.arpa.";
  }

  private static boolean isIpv4Literal(String input) {
    String[] octets = input.split("\\.", -1);
    for (String octet : octets) {
      try {
        if (octet.isEmpty() || (octet.length() > 1 && octet.startsWith("0"))) {
          return false;
        }
        if (Integer.parseInt(octet) > 255) {
          return false;
        }
      } catch (NumberFormatException exception) {
        return false;
      }
    }
    return true;
  }

  private static boolean isFourLabelNumericCandidate(String input) {
    return input.matches("[0-9.]+") && input.split("\\.", -1).length == 4;
  }

  private static String reverseIpv6(String input) {
    try {
      InetAddress address = InetAddress.getByName(input);
      if (!(address instanceof Inet6Address) || address instanceof Inet4Address) {
        throw validationError();
      }
      StringBuilder hexadecimal = new StringBuilder(32);
      for (byte octet : address.getAddress()) {
        hexadecimal.append(String.format("%02x", octet & 0xff));
      }
      StringBuilder reversed = new StringBuilder(4 * hexadecimal.length() + 9);
      for (int index = hexadecimal.length() - 1; index >= 0; index--) {
        reversed.append(hexadecimal.charAt(index)).append('.');
      }
      return reversed.append("ip6.arpa.").toString();
    } catch (UnknownHostException exception) {
      throw validationError();
    }
  }

  private static boolean isHostname(String input) {
    String name = input.endsWith(".") ? input.substring(0, input.length() - 1) : input;
    if (name.isEmpty() || name.length() > 253) {
      return false;
    }
    for (String label : name.split("\\.", -1)) {
      if (!label.matches("[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?")) {
        return false;
      }
    }
    return true;
  }

  private static ToolException validationError() {
    return new ToolException("VALIDATION_ERROR", "请输入合法的域名或 IP 地址");
  }

  private static long elapsedMs(long startedAt) {
    return Duration.ofNanos(System.nanoTime() - startedAt).toMillis();
  }

  private record QueryPlan(String queryName, List<String> types) {}
}
