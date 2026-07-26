package dev.sam.dailytools.tools.whois;

import java.util.List;

public record RdapReport(
    String input,
    String domain,
    boolean found,
    String source,
    String ldhName,
    String unicodeName,
    String handle,
    List<String> statuses,
    List<Event> events,
    Registrar registrar,
    List<Nameserver> nameservers,
    List<Notice> notices,
    String rawJson) {
  public RdapReport {
    statuses = List.copyOf(statuses);
    events = List.copyOf(events);
    nameservers = List.copyOf(nameservers);
    notices = List.copyOf(notices);
  }

  static RdapReport notFound(String input, String domain, String source) {
    return new RdapReport(input, domain, false, source, null, null, null, List.of(), List.of(), null, List.of(), List.of(), null);
  }

  public record Event(String action, String date, String actor) {}
  public record Registrar(String name, String handle) {}
  public record Nameserver(String ldhName, String unicodeName, List<String> statuses) {
    public Nameserver { statuses = List.copyOf(statuses); }
  }
  public record Notice(String title, List<String> description) {
    public Notice { description = List.copyOf(description); }
  }
}
