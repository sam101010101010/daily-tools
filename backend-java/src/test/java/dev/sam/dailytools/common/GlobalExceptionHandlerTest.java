package dev.sam.dailytools.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

  @Test
  void internal_error_does_not_leak_exception_message() {
    GlobalExceptionHandler handler = new GlobalExceptionHandler();

    ResponseEntity<ApiEnvelope<Void>> resp =
        handler.handleOther(new RuntimeException("jdbc:postgresql://db/secret?password=hunter2"));

    ApiError error = resp.getBody().error();
    assertThat(error.code()).isEqualTo("INTERNAL_ERROR");
    assertThat(error.message()).doesNotContain("hunter2", "jdbc", "password");
  }
}
