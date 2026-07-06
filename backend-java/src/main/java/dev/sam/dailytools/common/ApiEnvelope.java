package dev.sam.dailytools.common;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiEnvelope<T>(boolean ok, T data, ApiError error) {
  public static <T> ApiEnvelope<T> ok(T data) { return new ApiEnvelope<>(true, data, null); }
  public static <T> ApiEnvelope<T> fail(ApiError error) { return new ApiEnvelope<>(false, null, error); }
}
