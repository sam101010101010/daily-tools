package dev.sam.dailytools.tools.crypto;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Symmetric crypto via the JDK's JCE (ADR-0007). This class never logs any request field (key,
 * passphrase, plaintext). T1 implements the AES/ECB path plus key resolution; CBC/GCM (T2) and
 * refined error classification (T3) build on it.
 */
@Service
public class CryptoService {

  public CryptoResult transform(CryptoRequest req) {
    boolean encrypt = !"decrypt".equals(req.op());
    byte[] keyBytes = resolveKey(req);
    String inputEnc = orDefault(req.inputEnc(), encrypt ? "utf8" : "base64");
    String outputEnc = orDefault(req.outputEnc(), encrypt ? "base64" : "utf8");
    byte[] inputBytes = ByteCodec.decode(req.input(), inputEnc);
    try {
      Cipher cipher = Cipher.getInstance("AES/" + req.mode() + "/" + req.padding());
      cipher.init(encrypt ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes, "AES"));
      byte[] out = cipher.doFinal(inputBytes);
      return new CryptoResult(ByteCodec.encode(out, outputEnc), "");
    } catch (GeneralSecurityException e) {
      // Failure classification (DECRYPT_FAILED / VALIDATION_ERROR) is refined in T3; keep it
      // non-revealing for now rather than leaking the raw JCE exception message.
      throw new ToolException("INTERNAL_ERROR", "加解密失败");
    }
  }

  /**
   * Resolve the AES key bytes from the request and validate the length is a legal AES key size
   * (16/24/32 → AES-128/192/256). {@code raw} decodes the key directly; {@code hash} derives it by
   * digesting the passphrase (MD5 → 16B, SHA-256 → 32B).
   */
  static byte[] resolveKey(CryptoRequest req) {
    byte[] key = switch (req.keySource()) {
      case "raw" -> ByteCodec.decode(req.key(), orDefault(req.keyEnc(), "utf8"));
      case "hash" -> digest(req.keyHash(), ByteCodec.decode(req.key(), orDefault(req.keyEnc(), "utf8")));
      default -> throw new ToolException("VALIDATION_ERROR", "未知密钥来源：" + req.keySource());
    };
    if (key.length != 16 && key.length != 24 && key.length != 32) {
      throw new ToolException("VALIDATION_ERROR",
          "密钥长度必须为 16/24/32 字节（AES-128/192/256），当前 " + key.length);
    }
    return key;
  }

  private static byte[] digest(String algo, byte[] data) {
    if (!"MD5".equals(algo) && !"SHA-256".equals(algo)) {
      throw new ToolException("VALIDATION_ERROR", "未知哈希算法：" + algo);
    }
    try {
      return MessageDigest.getInstance(algo).digest(data);
    } catch (NoSuchAlgorithmException e) {
      throw new ToolException("VALIDATION_ERROR", "未知哈希算法：" + algo);
    }
  }

  private static String orDefault(String v, String d) {
    return (v == null || v.isEmpty()) ? d : v;
  }
}
