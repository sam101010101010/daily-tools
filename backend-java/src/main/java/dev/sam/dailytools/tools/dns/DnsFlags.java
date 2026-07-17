package dev.sam.dailytools.tools.dns;

public record DnsFlags(
    boolean authoritative,
    boolean truncated,
    boolean recursionDesired,
    boolean recursionAvailable,
    boolean authenticatedData) {}
