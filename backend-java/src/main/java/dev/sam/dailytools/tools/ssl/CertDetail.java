package dev.sam.dailytools.tools.ssl;

import java.util.List;

/**
 * Parsed detail of a single X.509 certificate in the presented chain. Purely descriptive —
 * no trust judgement (that is {@code TrustEvaluator}) and no hostname match (that is
 * {@code HostnameMatcher}). {@code keySize} is null for key types other than RSA/EC.
 */
public record CertDetail(
    String subjectCN,
    String subjectO,
    String issuerCN,
    String issuerO,
    String subjectDN,
    String issuerDN,
    String notBefore,
    String notAfter,
    boolean expired,
    long daysUntilExpiry,
    String keyAlgorithm,
    Integer keySize,
    String signatureAlgorithm,
    boolean weakSignature,
    String sha256Fingerprint,
    String serialNumber,
    List<String> sans) {}
