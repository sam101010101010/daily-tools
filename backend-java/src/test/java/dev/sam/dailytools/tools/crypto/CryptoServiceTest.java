package dev.sam.dailytools.tools.crypto;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.security.MessageDigest;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CryptoServiceTest {

  private final CryptoService service = new CryptoService();

  // --- FIPS-197 Appendix C AES ECB/NoPadding single-block known-answer vectors ---
  // Authoritative, so a correct AES core cannot accidentally reproduce them.

  @Test
  void fips197_aes128_ecb_nopadding_kat() {
    CryptoResult r = service.transform(new Req()
        .padding("NoPadding")
        .key("000102030405060708090a0b0c0d0e0f").keyEnc("hex")
        .input("00112233445566778899aabbccddeeff").inputEnc("hex")
        .outputEnc("hex").build());
    assertThat(r.output()).isEqualTo("69c4e0d86a7b0430d8cdb78070b4c55a");
  }

  @Test
  void fips197_aes192_ecb_nopadding_kat() {
    CryptoResult r = service.transform(new Req()
        .padding("NoPadding")
        .key("000102030405060708090a0b0c0d0e0f1011121314151617").keyEnc("hex")
        .input("00112233445566778899aabbccddeeff").inputEnc("hex")
        .outputEnc("hex").build());
    assertThat(r.output()).isEqualTo("dda97ca4864cdfe06eaf70a0ec0d7191");
  }

  @Test
  void fips197_aes256_ecb_nopadding_kat() {
    CryptoResult r = service.transform(new Req()
        .padding("NoPadding")
        .key("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f").keyEnc("hex")
        .input("00112233445566778899aabbccddeeff").inputEnc("hex")
        .outputEnc("hex").build());
    assertThat(r.output()).isEqualTo("8ea2b7ca516745bfeafc49904b496089");
  }

  @Test
  void ecb_pkcs5_roundtrip_recovers_plaintext() {
    Req base = new Req().padding("PKCS5Padding")
        .key("0123456789abcdef").keyEnc("utf8"); // 16-byte AES-128 key
    CryptoResult enc = service.transform(base.copy().op("encrypt")
        .input("hello, 世界").inputEnc("utf8").outputEnc("base64").build());
    CryptoResult dec = service.transform(base.copy().op("decrypt")
        .input(enc.output()).inputEnc("base64").outputEnc("utf8").build());
    assertThat(dec.output()).isEqualTo("hello, 世界");
  }

  @Test
  void ecb_result_iv_is_empty() {
    CryptoResult r = service.transform(new Req()
        .padding("NoPadding")
        .key("000102030405060708090a0b0c0d0e0f").keyEnc("hex")
        .input("00112233445566778899aabbccddeeff").inputEnc("hex")
        .outputEnc("hex").build());
    assertThat(r.iv()).isEmpty();
  }

  // --- CBC / GCM (T2) ---

  // SP800-38A F.2.1 AES-128 CBC single-block known-answer vector (authoritative).
  @Test
  void sp800_38a_aes128_cbc_nopadding_kat() {
    CryptoResult r = service.transform(new Req()
        .mode("CBC").padding("NoPadding")
        .key("2b7e151628aed2a6abf7158809cf4f3c").keyEnc("hex")
        .iv("000102030405060708090a0b0c0d0e0f").ivEnc("hex")
        .input("6bc1bee22e409f96e93d7e117393172a").inputEnc("hex")
        .outputEnc("hex").build());
    assertThat(r.output()).isEqualTo("7649abac8119b246cee98e9b12e9197d");
  }

  @Test
  void cbc_result_echoes_iv_actually_used() {
    CryptoResult r = service.transform(new Req()
        .mode("CBC").padding("NoPadding")
        .key("2b7e151628aed2a6abf7158809cf4f3c").keyEnc("hex")
        .iv("000102030405060708090a0b0c0d0e0f").ivEnc("hex")
        .input("6bc1bee22e409f96e93d7e117393172a").inputEnc("hex")
        .outputEnc("hex").build());
    assertThat(r.iv()).isEqualTo("000102030405060708090a0b0c0d0e0f");
  }

  @Test
  void cbc_pkcs5_roundtrip_recovers_plaintext() {
    Req base = new Req().mode("CBC").padding("PKCS5Padding")
        .key("0123456789abcdef").keyEnc("utf8")          // 16-byte AES-128 key
        .iv("00112233445566778899aabbccddeeff").ivEnc("hex"); // 16-byte IV
    CryptoResult enc = service.transform(base.copy().op("encrypt")
        .input("hello, 世界").inputEnc("utf8").outputEnc("base64").build());
    CryptoResult dec = service.transform(base.copy().op("decrypt")
        .input(enc.output()).inputEnc("base64").outputEnc("utf8").build());
    assertThat(dec.output()).isEqualTo("hello, 世界");
  }

  @Test
  void gcm_roundtrip_recovers_plaintext() {
    Req base = new Req().mode("GCM").padding("NoPadding")
        .key("0123456789abcdef").keyEnc("utf8")
        .iv("000102030405060708090a0b").ivEnc("hex");    // 12-byte nonce
    CryptoResult enc = service.transform(base.copy().op("encrypt")
        .input("hello, 世界").inputEnc("utf8").outputEnc("base64").build());
    CryptoResult dec = service.transform(base.copy().op("decrypt")
        .input(enc.output()).inputEnc("base64").outputEnc("utf8").build());
    assertThat(dec.output()).isEqualTo("hello, 世界");
  }

  @Test
  void gcm_ciphertext_is_plaintext_plus_16_byte_tag() {
    CryptoResult enc = service.transform(new Req()
        .op("encrypt").mode("GCM").padding("NoPadding")
        .key("0123456789abcdef").keyEnc("utf8")
        .iv("000102030405060708090a0b").ivEnc("hex")
        .input("0123456789").inputEnc("utf8")            // 10 plaintext bytes
        .outputEnc("hex").build());
    assertThat(enc.output()).hasSize((10 + 16) * 2);     // (plaintext + tag) bytes as hex
  }

  @Test
  void cbc_missing_iv_is_validation_error() {
    assertThatThrownBy(() -> service.transform(new Req()
        .op("encrypt").mode("CBC").padding("PKCS5Padding")
        .key("0123456789abcdef").keyEnc("utf8")
        .input("hi").inputEnc("utf8").build()))          // no IV supplied
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  @Test
  void cbc_short_iv_is_validation_error() {
    assertThatThrownBy(() -> service.transform(new Req()
        .op("encrypt").mode("CBC").padding("PKCS5Padding")
        .key("0123456789abcdef").keyEnc("utf8")
        .iv("00112233445566778899aabbccddee").ivEnc("hex") // 15 bytes
        .input("hi").inputEnc("utf8").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  @Test
  void gcm_short_nonce_is_validation_error() {
    assertThatThrownBy(() -> service.transform(new Req()
        .op("encrypt").mode("GCM").padding("NoPadding")
        .key("0123456789abcdef").keyEnc("utf8")
        .iv("000102030405060708090a").ivEnc("hex")       // 11 bytes
        .input("hi").inputEnc("utf8").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  // --- error classification + sanitising (T3) ---
  // Decryption failures collapse to one DECRYPT_FAILED code (no padding oracle); caller/config
  // mistakes are VALIDATION_ERROR; raw JCE messages never surface.

  @Test
  void transform_rejects_wrong_key_length_as_validation_error() {
    assertThatThrownBy(() -> service.transform(new Req()
        .op("encrypt").mode("ECB").padding("PKCS5Padding")
        .keySource("raw").key("123456789012345").keyEnc("utf8") // 15 bytes
        .input("hi").inputEnc("utf8").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  @Test
  void gcm_tampered_ciphertext_is_decrypt_failed() {
    Req base = new Req().mode("GCM").padding("NoPadding")
        .key("0123456789abcdef").keyEnc("utf8")
        .iv("000102030405060708090a0b").ivEnc("hex");
    CryptoResult enc = service.transform(base.copy().op("encrypt")
        .input("secret payload").inputEnc("utf8").outputEnc("hex").build());
    char[] c = enc.output().toCharArray();
    c[0] = (c[0] == '0') ? '1' : '0'; // flip the first ciphertext byte -> GCM tag mismatch
    String tampered = new String(c);
    assertThatThrownBy(() -> service.transform(base.copy().op("decrypt")
        .input(tampered).inputEnc("hex").outputEnc("utf8").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("DECRYPT_FAILED"));
  }

  @Test
  void cbc_wrong_key_decrypt_is_decrypt_failed() {
    CryptoResult enc = service.transform(new Req()
        .op("encrypt").mode("CBC").padding("PKCS5Padding")
        .key("0123456789abcdef").keyEnc("utf8")
        .iv("00112233445566778899aabbccddeeff").ivEnc("hex")
        .input("hello, 世界").inputEnc("utf8").outputEnc("base64").build());
    assertThatThrownBy(() -> service.transform(new Req()
        .op("decrypt").mode("CBC").padding("PKCS5Padding")
        .key("fedcba9876543210").keyEnc("utf8")          // wrong key -> bad PKCS5 padding
        .iv("00112233445566778899aabbccddeeff").ivEnc("hex")
        .input(enc.output()).inputEnc("base64").outputEnc("utf8").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("DECRYPT_FAILED"));
  }

  @Test
  void encrypt_nopadding_non_block_multiple_is_validation_error() {
    assertThatThrownBy(() -> service.transform(new Req()
        .op("encrypt").mode("ECB").padding("NoPadding")
        .key("0123456789abcdef").keyEnc("utf8")
        .input("0102030405").inputEnc("hex")            // 5 bytes, not a 16B multiple
        .outputEnc("hex").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  @Test
  void unknown_mode_is_validation_error() {
    assertThatThrownBy(() -> service.transform(new Req()
        .op("encrypt").mode("XTS").padding("NoPadding")
        .key("0123456789abcdef").keyEnc("utf8")
        .input("00112233445566778899aabbccddeeff").inputEnc("hex")
        .outputEnc("hex").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  // --- ByteCodec ---

  @Test
  void bytecodec_roundtrips_each_encoding() {
    byte[] raw = {0x00, (byte) 0x9a, (byte) 0xff, 0x10};
    assertThat(ByteCodec.decode(ByteCodec.encode(raw, "hex"), "hex")).isEqualTo(raw);
    assertThat(ByteCodec.decode(ByteCodec.encode(raw, "base64"), "base64")).isEqualTo(raw);
    assertThat(ByteCodec.decode("hello", "utf8")).isEqualTo("hello".getBytes(UTF_8));
    assertThat(ByteCodec.encode("hello".getBytes(UTF_8), "utf8")).isEqualTo("hello");
  }

  @Test
  void bytecodec_hex_is_lowercase() {
    assertThat(ByteCodec.encode(new byte[] {(byte) 0xAB, (byte) 0xCD}, "hex")).isEqualTo("abcd");
  }

  @Test
  void bytecodec_unknown_encoding_is_validation_error() {
    assertThatThrownBy(() -> ByteCodec.decode("x", "rot13"))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  @Test
  void bytecodec_malformed_hex_is_validation_error() {
    assertThatThrownBy(() -> ByteCodec.decode("abc", "hex")) // odd length
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  // --- key resolution ---

  @Test
  void resolvekey_md5_derives_16_byte_aes128_key() throws Exception {
    byte[] key = CryptoService.resolveKey(new Req()
        .keySource("hash").keyHash("MD5").key("passphrase").keyEnc("utf8").build());
    assertThat(key).hasSize(16)
        .isEqualTo(MessageDigest.getInstance("MD5").digest("passphrase".getBytes(UTF_8)));
  }

  @Test
  void resolvekey_sha256_derives_32_byte_aes256_key() throws Exception {
    byte[] key = CryptoService.resolveKey(new Req()
        .keySource("hash").keyHash("SHA-256").key("passphrase").keyEnc("utf8").build());
    assertThat(key).hasSize(32)
        .isEqualTo(MessageDigest.getInstance("SHA-256").digest("passphrase".getBytes(UTF_8)));
  }

  @Test
  void resolvekey_raw_accepts_valid_lengths() {
    for (int len : new int[] {16, 24, 32}) {
      byte[] key = CryptoService.resolveKey(new Req()
          .keySource("raw").key("00".repeat(len)).keyEnc("hex").build());
      assertThat(key).hasSize(len);
    }
  }

  @Test
  void resolvekey_rejects_wrong_length_raw_key() {
    assertThatThrownBy(() -> CryptoService.resolveKey(new Req()
        .keySource("raw").key("123456789012345").keyEnc("utf8").build())) // 15 bytes
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  @Test
  void resolvekey_rejects_unknown_key_source() {
    assertThatThrownBy(() -> CryptoService.resolveKey(new Req()
        .keySource("magic").key("x").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  // --- tapdata AES256Util byte-level replica (golden contract) ---
  // The passphrase is the AES256Util KEY constant and must never live in this repo. The test is
  // wired but runs only when CRYPTO_PRESET_TAPDATA_KEY is injected into the env (CI secret or a
  // local export); otherwise it is skipped. Pin: MD5(KEY) -> AES-128/ECB/PKCS5, Encode("root123").
  @Test
  @EnabledIfEnvironmentVariable(named = "CRYPTO_PRESET_TAPDATA_KEY", matches = ".+")
  void aes256util_real_ciphertext_pin() {
    String passphrase = System.getenv("CRYPTO_PRESET_TAPDATA_KEY");
    CryptoResult enc = service.transform(new Req()
        .op("encrypt").mode("ECB").padding("PKCS5Padding")
        .keySource("hash").keyHash("MD5").key(passphrase).keyEnc("utf8")
        .input("root123").inputEnc("utf8").outputEnc("hex").build());
    assertThat(enc.output()).isEqualTo("414932aaef43ec67ab32846f090bc033");

    CryptoResult dec = service.transform(new Req()
        .op("decrypt").mode("ECB").padding("PKCS5Padding")
        .keySource("hash").keyHash("MD5").key(passphrase).keyEnc("utf8")
        .input("414932aaef43ec67ab32846f090bc033").inputEnc("hex").outputEnc("utf8").build());
    assertThat(dec.output()).isEqualTo("root123");
  }

  // --- named presets (T9) ---
  // The tapdata passphrase lives only in CRYPTO_PRESET_TAPDATA_KEY; preset tests needing it are
  // env-gated (skipped when unset), same as the T1 pin. The unknown-preset path needs no key.

  @Test
  void unknown_preset_is_validation_error() {
    assertThatThrownBy(() -> service.transform(new Req()
        .op("encrypt").keySource("preset").preset("no-such-preset")
        .input("root123").inputEnc("utf8").outputEnc("hex").build()))
        .isInstanceOf(ToolException.class)
        .satisfies(e -> assertThat(((ToolException) e).getCode()).isEqualTo("VALIDATION_ERROR"));
  }

  @Test
  @EnabledIfEnvironmentVariable(named = "CRYPTO_PRESET_TAPDATA_KEY", matches = ".+")
  void tapdata_preset_encrypt_decrypt_roundtrips() {
    CryptoResult enc = service.transform(new Req()
        .op("encrypt").keySource("preset").preset("tapdata")
        .input("hello 世界").inputEnc("utf8").outputEnc("hex").build());
    CryptoResult dec = service.transform(new Req()
        .op("decrypt").keySource("preset").preset("tapdata")
        .input(enc.output()).inputEnc("hex").outputEnc("utf8").build());
    assertThat(dec.output()).isEqualTo("hello 世界");
  }

  // Locks "preset tapdata == AES256Util": same magic constant as the T1 explicit-passphrase pin.
  @Test
  @EnabledIfEnvironmentVariable(named = "CRYPTO_PRESET_TAPDATA_KEY", matches = ".+")
  void tapdata_preset_reproduces_aes256util_ciphertext() {
    CryptoResult enc = service.transform(new Req()
        .op("encrypt").keySource("preset").preset("tapdata")
        .input("root123").inputEnc("utf8").outputEnc("hex").build());
    assertThat(enc.output()).isEqualTo("414932aaef43ec67ab32846f090bc033");
  }

  /** Fluent builder for the 13-field {@link CryptoRequest}; keeps each test to the fields it cares about. */
  private static final class Req {
    private String op = "encrypt", mode = "ECB", padding = "PKCS5Padding";
    private String keySource = "raw", keyHash;
    private String key, keyEnc = "utf8";
    private String preset;
    private String iv, ivEnc = "hex";
    private String input, inputEnc, outputEnc;

    Req op(String v) { op = v; return this; }
    Req mode(String v) { mode = v; return this; }
    Req padding(String v) { padding = v; return this; }
    Req keySource(String v) { keySource = v; return this; }
    Req keyHash(String v) { keyHash = v; return this; }
    Req preset(String v) { preset = v; return this; }
    Req key(String v) { key = v; return this; }
    Req keyEnc(String v) { keyEnc = v; return this; }
    Req iv(String v) { iv = v; return this; }
    Req ivEnc(String v) { ivEnc = v; return this; }
    Req input(String v) { input = v; return this; }
    Req inputEnc(String v) { inputEnc = v; return this; }
    Req outputEnc(String v) { outputEnc = v; return this; }

    Req copy() {
      Req r = new Req();
      r.op = op; r.mode = mode; r.padding = padding;
      r.keySource = keySource; r.keyHash = keyHash;
      r.key = key; r.keyEnc = keyEnc; r.preset = preset;
      r.iv = iv; r.ivEnc = ivEnc;
      r.input = input; r.inputEnc = inputEnc; r.outputEnc = outputEnc;
      return r;
    }

    CryptoRequest build() {
      return new CryptoRequest(op, mode, padding, keySource, keyHash,
          key, keyEnc, preset, iv, ivEnc, input, inputEnc, outputEnc);
    }
  }
}
