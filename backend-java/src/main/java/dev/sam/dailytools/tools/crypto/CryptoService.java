package dev.sam.dailytools.tools.crypto;

import dev.sam.dailytools.common.ToolException;
import org.springframework.stereotype.Service;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Symmetric crypto via the JDK's JCE (ADR-0007). This class never logs any request field (key,
 * passphrase, plaintext). T1 implements the AES/ECB path plus key resolution; T2 adds CBC/GCM with
 * IV/nonce validation; refined error classification (DECRYPT_FAILED / VALIDATION_ERROR) lands in T3.
 */
@Service
public class CryptoService {

  private static final int GCM_TAG_BITS = 128; // JCE default; tag is appended to the ciphertext.

  public CryptoResult transform(CryptoRequest req) {
    boolean encrypt = !"decrypt".equals(req.op());

    // A named preset overrides mode/padding/key from a backend-only passphrase (ADR-0007 D7); the
    // frontend sends only the preset name. Everything else flows through the normal request fields.
    boolean preset = "preset".equals(req.keySource());
    CryptoPresets.Preset p = preset ? requirePreset(req.preset()) : null;

    String mode = preset ? p.mode() : req.mode();
    // GCM is an AEAD stream mode; padding is meaningless and forced to NoPadding.
    String padding = "GCM".equals(mode) ? "NoPadding" : (preset ? p.padding() : req.padding());
    byte[] keyBytes = preset
        ? validateKeyLength(digest(p.keyHash(), ByteCodec.decode(p.passphrase(), "utf8")))
        : resolveKey(req);
    byte[] iv = resolveIv(mode, req); // null for ECB; validated 16B (CBC) / 12B (GCM) otherwise

    // Presets follow the legacy scheme (hex ciphertext); raw/hash default to base64.
    String inputEnc = orDefault(req.inputEnc(), encrypt ? "utf8" : (preset ? "hex" : "base64"));
    String outputEnc = orDefault(req.outputEnc(), encrypt ? (preset ? "hex" : "base64") : "utf8");
    byte[] inputBytes = ByteCodec.decode(req.input(), inputEnc);
    try {
      Cipher cipher = Cipher.getInstance("AES/" + mode + "/" + padding);
      SecretKeySpec keySpec = new SecretKeySpec(keyBytes, "AES");
      int cipherMode = encrypt ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE;
      switch (mode) {
        case "ECB" -> cipher.init(cipherMode, keySpec);
        case "CBC" -> cipher.init(cipherMode, keySpec, new IvParameterSpec(iv));
        case "GCM" -> cipher.init(cipherMode, keySpec, new GCMParameterSpec(GCM_TAG_BITS, iv));
        default -> throw new ToolException("VALIDATION_ERROR", "未知加密模式：" + mode);
      }
      byte[] out = cipher.doFinal(inputBytes);
      String ivEcho = iv == null ? "" : ByteCodec.encode(iv, orDefault(req.ivEnc(), "hex"));
      return new CryptoResult(ByteCodec.encode(out, outputEnc), ivEcho);
    } catch (NoSuchAlgorithmException | NoSuchPaddingException e) {
      // Unknown mode/padding string — a caller mistake, not a server fault. Never echo the raw
      // JCE message (it names the attempted transformation); report the offending values only.
      throw new ToolException("VALIDATION_ERROR", "未知的加密模式或填充：" + mode + "/" + padding);
    } catch (IllegalBlockSizeException | BadPaddingException e) {
      if (encrypt) {
        // On encrypt this is only reachable via NoPadding with a non-block-multiple input.
        throw new ToolException("VALIDATION_ERROR", "NoPadding 模式下输入长度须为 16 字节整数倍");
      }
      // Every decrypt failure — wrong key, wrong IV, corrupted ciphertext, GCM tag mismatch —
      // collapses to one code and one message: no padding oracle (ADR-0007).
      throw new ToolException("DECRYPT_FAILED", "解密失败：密钥、IV 或密文不匹配");
    } catch (GeneralSecurityException e) {
      // Backstop for anything unclassified; the global handler renders a constant INTERNAL_ERROR
      // message. Still never leaks the raw JCE text.
      throw new ToolException("INTERNAL_ERROR", "加解密失败");
    }
  }

  /**
   * Resolve and validate the IV/nonce for the requested mode: ECB has none (returns {@code null}),
   * CBC needs a 16-byte IV, GCM needs a 12-byte nonce. A missing or wrong-length value is a
   * {@code VALIDATION_ERROR} — surfaced before {@link Cipher#init} so it can't leak as INTERNAL_ERROR.
   */
  private static byte[] resolveIv(String mode, CryptoRequest req) {
    int required = switch (mode) {
      case "CBC" -> 16;
      case "GCM" -> 12;
      default -> -1; // ECB (and anything else) carries no IV here
    };
    if (required < 0) {
      return null;
    }
    String label = "GCM".equals(mode) ? "GCM nonce" : "CBC IV";
    if (req.iv() == null || req.iv().isEmpty()) {
      throw new ToolException("VALIDATION_ERROR", label + "（" + required + " 字节）未提供");
    }
    byte[] iv = ByteCodec.decode(req.iv(), orDefault(req.ivEnc(), "hex"));
    if (iv.length != required) {
      throw new ToolException("VALIDATION_ERROR",
          label + " 必须为 " + required + " 字节，当前 " + iv.length);
    }
    return iv;
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
    return validateKeyLength(key);
  }

  private static byte[] validateKeyLength(byte[] key) {
    if (key.length != 16 && key.length != 24 && key.length != 32) {
      throw new ToolException("VALIDATION_ERROR",
          "密钥长度必须为 16/24/32 字节（AES-128/192/256），当前 " + key.length);
    }
    return key;
  }

  private static CryptoPresets.Preset requirePreset(String name) {
    CryptoPresets.Preset p = CryptoPresets.get(name);
    if (p == null) {
      // Unknown name, or a known preset whose passphrase env var is unset — same non-revealing code.
      throw new ToolException("VALIDATION_ERROR", "未知或不可用的预设：" + name);
    }
    return p;
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
