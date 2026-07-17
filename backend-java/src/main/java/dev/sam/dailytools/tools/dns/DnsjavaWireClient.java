package dev.sam.dailytools.tools.dns;

import org.springframework.stereotype.Service;
import org.xbill.DNS.AAAARecord;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.CAARecord;
import org.xbill.DNS.CNAMERecord;
import org.xbill.DNS.DClass;
import org.xbill.DNS.DNSKEYRecord;
import org.xbill.DNS.DSRecord;
import org.xbill.DNS.ExtendedFlags;
import org.xbill.DNS.Flags;
import org.xbill.DNS.MXRecord;
import org.xbill.DNS.Message;
import org.xbill.DNS.NSRecord;
import org.xbill.DNS.Name;
import org.xbill.DNS.PTRRecord;
import org.xbill.DNS.RRSIGRecord;
import org.xbill.DNS.Rcode;
import org.xbill.DNS.Record;
import org.xbill.DNS.Resolver;
import org.xbill.DNS.SOARecord;
import org.xbill.DNS.SRVRecord;
import org.xbill.DNS.Section;
import org.xbill.DNS.SimpleResolver;
import org.xbill.DNS.TXTRecord;
import org.xbill.DNS.Type;

import java.io.InterruptedIOException;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DnsjavaWireClient implements DnsWireClient {
  private static final Duration QUERY_TIMEOUT = Duration.ofSeconds(3);

  @Override
  public DnsQueryResult query(String qname, String type, DnsResolverChoice resolverChoice) {
    long startedAt = System.nanoTime();
    try {
      Message request = buildQuery(qname, type);
      Message response = resolverFor(DnsResolverChoice.defaultFor(resolverChoice)).send(request);
      return mapResponse(qname, type, elapsedMs(startedAt), response);
    } catch (InterruptedIOException exception) {
      return DnsQueryResult.transportError(qname, type, elapsedMs(startedAt), "DNS_TIMEOUT", messageFor(exception));
    } catch (IOException exception) {
      return DnsQueryResult.transportError(qname, type, elapsedMs(startedAt), "DNS_TRANSPORT_ERROR", messageFor(exception));
    }
  }

  static Message buildQuery(String qname, String type) throws IOException {
    int queryType = Type.value(type);
    if (queryType < 0 || queryType == Type.ANY) {
      throw new IllegalArgumentException("A concrete DNS record type is required");
    }
    return Message.newQuery(Record.newRecord(Name.fromString(qname, Name.root), queryType, DClass.IN));
  }

  private static Resolver resolverFor(DnsResolverChoice resolverChoice) throws IOException {
    SimpleResolver resolver = resolverChoice == DnsResolverChoice.CLOUDFLARE
        ? new SimpleResolver("1.1.1.1")
        : new SimpleResolver();
    resolver.setTimeout(QUERY_TIMEOUT);
    resolver.setEDNS(0, 0, ExtendedFlags.DO, List.of());
    return resolver;
  }

  static DnsQueryResult mapResponse(String qname, String type, long elapsedMs, Message message) {
    return new DnsQueryResult(
        qname,
        type,
        elapsedMs,
        Rcode.string(message.getHeader().getRcode()),
        new DnsFlags(
            message.getHeader().getFlag(Flags.AA),
            message.getHeader().getFlag(Flags.TC),
            message.getHeader().getFlag(Flags.RD),
            message.getHeader().getFlag(Flags.RA),
            message.getHeader().getFlag(Flags.AD)),
        null,
        mapSection(message, Section.ANSWER),
        mapSection(message, Section.AUTHORITY),
        mapSection(message, Section.ADDITIONAL));
  }

  private static List<DnsRecord> mapSection(Message message, int section) {
    List<DnsRecord> records = new ArrayList<>();
    for (Record record : message.getSectionArray(section)) {
      records.add(mapRecord(record));
    }
    return records;
  }

  private static DnsRecord mapRecord(Record record) {
    Map<String, String> fields = new LinkedHashMap<>();
    String value = record.rdataToString();
    if (record instanceof ARecord a) {
      value = a.getAddress().getHostAddress();
    } else if (record instanceof AAAARecord aaaa) {
      value = aaaa.getAddress().getHostAddress();
    } else if (record instanceof CNAMERecord cname) {
      value = cname.getTarget().toString();
    } else if (record instanceof MXRecord mx) {
      fields.put("priority", String.valueOf(mx.getPriority()));
      fields.put("target", mx.getTarget().toString());
      value = mx.getPriority() + " " + mx.getTarget();
    } else if (record instanceof TXTRecord txt) {
      value = String.join(" ", txt.getStrings());
    } else if (record instanceof NSRecord ns) {
      value = ns.getTarget().toString();
    } else if (record instanceof SOARecord soa) {
      fields.put("primaryNameServer", soa.getHost().toString());
      fields.put("hostmaster", soa.getAdmin().toString());
      fields.put("serial", String.valueOf(soa.getSerial()));
      fields.put("refresh", String.valueOf(soa.getRefresh()));
      fields.put("retry", String.valueOf(soa.getRetry()));
      fields.put("expire", String.valueOf(soa.getExpire()));
      fields.put("minimum", String.valueOf(soa.getMinimum()));
    } else if (record instanceof CAARecord caa) {
      fields.put("flags", String.valueOf(caa.getFlags()));
      fields.put("tag", caa.getTag());
      fields.put("value", caa.getValue());
    } else if (record instanceof SRVRecord srv) {
      fields.put("priority", String.valueOf(srv.getPriority()));
      fields.put("weight", String.valueOf(srv.getWeight()));
      fields.put("port", String.valueOf(srv.getPort()));
      fields.put("target", srv.getTarget().toString());
    } else if (record instanceof PTRRecord ptr) {
      value = ptr.getTarget().toString();
    } else if (record instanceof DSRecord ds) {
      fields.put("keyTag", String.valueOf(ds.getFootprint()));
      fields.put("algorithm", String.valueOf(ds.getAlgorithm()));
      fields.put("digestType", String.valueOf(ds.getDigestID()));
    } else if (record instanceof DNSKEYRecord dnskey) {
      fields.put("flags", String.valueOf(dnskey.getFlags()));
      fields.put("protocol", String.valueOf(dnskey.getProtocol()));
      fields.put("algorithm", String.valueOf(dnskey.getAlgorithm()));
    } else if (record instanceof RRSIGRecord rrsig) {
      fields.put("typeCovered", Type.string(rrsig.getTypeCovered()));
      fields.put("algorithm", String.valueOf(rrsig.getAlgorithm()));
      fields.put("labels", String.valueOf(rrsig.getLabels()));
      fields.put("originalTtl", String.valueOf(rrsig.getOrigTTL()));
      fields.put("signatureExpiration", rrsig.getExpire().toString());
      fields.put("signatureInception", rrsig.getTimeSigned().toString());
      fields.put("keyTag", String.valueOf(rrsig.getFootprint()));
    }
    return new DnsRecord(
        record.getName().toString(),
        Type.string(record.getType()),
        DClass.string(record.getDClass()),
        record.getTTL(),
        value,
        fields);
  }

  private static long elapsedMs(long startedAt) {
    return Duration.ofNanos(System.nanoTime() - startedAt).toMillis();
  }

  private static String messageFor(IOException exception) {
    return exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
  }
}
