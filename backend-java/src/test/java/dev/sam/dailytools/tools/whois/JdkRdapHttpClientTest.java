package dev.sam.dailytools.tools.whois;

import dev.sam.dailytools.common.ToolException;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class JdkRdapHttpClientTest {

  @Test
  void rejects_non_https_requests_before_transport() {
    HttpClient transport = mock(HttpClient.class);
    JdkRdapHttpClient client = new JdkRdapHttpClient(transport);

    assertThatThrownBy(() -> client.get(URI.create("http://rdap.example/domain/example.com")))
        .isInstanceOfSatisfying(ToolException.class,
            error -> assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED"));
    verifyNoInteractions(transport);
  }

  @Test
  void rejects_a_response_larger_than_one_mebibyte_without_leaking_body_content() {
    HttpClient transport = mock(HttpClient.class);
    @SuppressWarnings("unchecked")
    HttpResponse<byte[]> response = mock(HttpResponse.class);
    byte[] oversized = new byte[JdkRdapHttpClient.MAX_BODY_BYTES + 1];
    byte[] secret = "upstream-secret".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    System.arraycopy(secret, 0, oversized, 0, secret.length);
    when(response.body()).thenReturn(oversized);
    when(transport.sendAsync(any(), any(HttpResponse.BodyHandler.class)))
        .thenReturn(CompletableFuture.completedFuture(response));
    JdkRdapHttpClient client = new JdkRdapHttpClient(transport);

    assertThatThrownBy(() -> client.get(URI.create("https://rdap.example/domain/example.com")))
        .isInstanceOfSatisfying(ToolException.class, error -> {
          assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED");
          assertThat(error.getMessage()).doesNotContain("upstream-secret");
        });
  }

  @Test
  void bounded_body_remains_pending_after_headers_and_cancels_on_overflow() {
    HttpResponse.BodySubscriber<byte[]> subscriber =
        JdkRdapHttpClient.boundedBodyHandler().apply(mock(HttpResponse.ResponseInfo.class));
    Flow.Subscription subscription = mock(Flow.Subscription.class);
    subscriber.onSubscribe(subscription);

    subscriber.onNext(List.of(ByteBuffer.wrap(new byte[JdkRdapHttpClient.MAX_BODY_BYTES])));

    assertThat(subscriber.getBody().toCompletableFuture()).isNotDone();

    subscriber.onNext(List.of(ByteBuffer.wrap(new byte[] {1})));

    assertThat(subscriber.getBody().toCompletableFuture()).isCompletedExceptionally();
    org.mockito.Mockito.verify(subscription).cancel();
  }

  @Test
  void cancels_the_full_exchange_when_the_body_stalls_after_headers() {
    HttpClient transport = mock(HttpClient.class);
    CompletableFuture<HttpResponse<byte[]>> stalledExchange = new CompletableFuture<>();
    when(transport.sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(stalledExchange);
    JdkRdapHttpClient client = new JdkRdapHttpClient(transport, Duration.ofMillis(10));

    assertThatThrownBy(() -> client.get(URI.create("https://rdap.example/domain/example.com")))
        .isInstanceOfSatisfying(ToolException.class,
            error -> assertThat(error.getCode()).isEqualTo("RDAP_LOOKUP_FAILED"));
    assertThat(stalledExchange).isCancelled();
  }
}
