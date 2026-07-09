package dev.sam.dailytools.tools.crypto;

import dev.sam.dailytools.common.ToolException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Byte &lt;-&gt; string codec for the crypto tool. Supported encodings: {@code utf8}, {@code hex},
 * {@code base64}. Any unknown encoding or malformed input collapses to a {@code VALIDATION_ERROR}
 * {@link ToolException} — never a raw parser exception.
 */
final class ByteCodec {
  private ByteCodec() {}

  static byte[] decode(String s, String enc) {
    String in = s == null ? "" : s;
    try {
      return switch (enc) {
        case "utf8" -> in.getBytes(StandardCharsets.UTF_8);
        case "hex" -> HexFormat.of().parseHex(in);
        case "base64" -> Base64.getDecoder().decode(in);
        default -> throw new ToolException("VALIDATION_ERROR", "未知编码：" + enc);
      };
    } catch (IllegalArgumentException e) {
      throw new ToolException("VALIDATION_ERROR", "输入不是合法的 " + enc + " 编码");
    }
  }

  static String encode(byte[] b, String enc) {
    return switch (enc) {
      case "utf8" -> new String(b, StandardCharsets.UTF_8);
      case "hex" -> HexFormat.of().formatHex(b);
      case "base64" -> Base64.getEncoder().encodeToString(b);
      default -> throw new ToolException("VALIDATION_ERROR", "未知编码：" + enc);
    };
  }
}
