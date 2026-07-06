package dev.sam.dailytools.common;
public class ToolException extends RuntimeException {
  private final String code;
  public ToolException(String code, String message) { super(message); this.code = code; }
  public String getCode() { return code; }
}
