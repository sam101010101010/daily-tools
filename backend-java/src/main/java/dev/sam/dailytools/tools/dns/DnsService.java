package dev.sam.dailytools.tools.dns;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.InitialDirContext;
import java.util.*;

@Service
public class DnsService {
  public static final List<String> DEFAULT_TYPES = List.of("A", "AAAA", "MX", "TXT", "CNAME");
  private final DnsQuery query;

  public DnsService(DnsQuery query) { this.query = query; }

  public DnsRecords resolve(String domain, List<String> types) {
    List<String> want = (types == null || types.isEmpty()) ? DEFAULT_TYPES : types;
    Map<String, List<String>> out = new LinkedHashMap<>();
    for (String type : want) {
      List<String> vals = query.lookup(domain, type);
      if (vals != null && !vals.isEmpty()) out.put(type, vals);
    }
    if (out.isEmpty()) throw new ToolException("DNS_LOOKUP_FAILED", "无解析记录：" + domain);
    return new DnsRecords(domain, out);
  }

  // Real JNDI-backed query, wired as the Spring bean.
  @Service
  static class JndiDnsQuery implements DnsQuery {
    @Override public List<String> lookup(String domain, String type) {
      try {
        var env = new Hashtable<String, String>();
        env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
        env.put("java.naming.provider.url", "dns:");
        Attributes attrs = new InitialDirContext(env).getAttributes(domain, new String[]{type});
        Attribute attr = attrs.get(type);
        List<String> out = new ArrayList<>();
        if (attr != null) for (int i = 0; i < attr.size(); i++) out.add(String.valueOf(attr.get(i)));
        return out;
      } catch (NamingException e) {
        return List.of();
      }
    }
  }
}
