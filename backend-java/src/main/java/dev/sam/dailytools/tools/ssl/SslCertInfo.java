package dev.sam.dailytools.tools.ssl;
import java.util.List;
public record SslCertInfo(
    String subject, String issuer, String notBefore, String notAfter,
    boolean expired, long daysUntilExpiry, List<String> sans, String serialNumber) {}
