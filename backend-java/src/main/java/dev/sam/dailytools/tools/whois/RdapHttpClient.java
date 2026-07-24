package dev.sam.dailytools.tools.whois;

import java.net.URI;

public interface RdapHttpClient {
  RdapHttpResponse get(URI uri);
}
