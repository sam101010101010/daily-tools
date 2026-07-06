package dev.sam.dailytools.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ToolException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleTool(ToolException e) {
    return ResponseEntity.ok(ApiEnvelope.fail(new ApiError(e.getCode(), e.getMessage())));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiEnvelope<Void>> handleValidation(MethodArgumentNotValidException e) {
    String msg = e.getBindingResult().getFieldErrors().stream()
        .findFirst().map(f -> f.getField() + ": " + f.getDefaultMessage()).orElse("invalid request");
    return ResponseEntity.ok(ApiEnvelope.fail(new ApiError("VALIDATION_ERROR", msg)));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiEnvelope<Void>> handleOther(Exception e) {
    return ResponseEntity.status(HttpStatus.OK)
        .body(ApiEnvelope.fail(new ApiError("INTERNAL_ERROR", e.getMessage())));
  }
}
