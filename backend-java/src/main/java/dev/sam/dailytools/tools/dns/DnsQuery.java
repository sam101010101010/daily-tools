package dev.sam.dailytools.tools.dns;
import java.util.List;
public interface DnsQuery {
  List<String> lookup(String domain, String type);
}
