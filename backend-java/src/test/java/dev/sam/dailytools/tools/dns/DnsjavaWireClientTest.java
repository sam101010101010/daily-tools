package dev.sam.dailytools.tools.dns;

import org.junit.jupiter.api.Test;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.CAARecord;
import org.xbill.DNS.DClass;
import org.xbill.DNS.DNSKEYRecord;
import org.xbill.DNS.DSRecord;
import org.xbill.DNS.Flags;
import org.xbill.DNS.MXRecord;
import org.xbill.DNS.Message;
import org.xbill.DNS.NSRecord;
import org.xbill.DNS.Name;
import org.xbill.DNS.Rcode;
import org.xbill.DNS.RRSIGRecord;
import org.xbill.DNS.SOARecord;
import org.xbill.DNS.SRVRecord;
import org.xbill.DNS.Section;
import org.xbill.DNS.TXTRecord;
import org.xbill.DNS.Type;

import java.net.InetAddress;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DnsjavaWireClientTest {
  @Test
  void maps_response_sections_flags_and_mx_fields() throws Exception {
    Name owner = Name.fromString("example.com.");
    Message message = new Message();
    message.getHeader().setRcode(Rcode.NOERROR);
    message.getHeader().setFlag(Flags.AA);
    message.getHeader().setFlag(Flags.TC);
    message.getHeader().setFlag(Flags.RD);
    message.getHeader().setFlag(Flags.RA);
    message.getHeader().setFlag(Flags.AD);
    message.addRecord(new MXRecord(owner, DClass.IN, 300, 10, Name.fromString("mail.example.com.")), Section.ANSWER);
    message.addRecord(new NSRecord(owner, DClass.IN, 600, Name.fromString("ns1.example.com.")), Section.AUTHORITY);
    message.addRecord(new ARecord(Name.fromString("ns1.example.com."), DClass.IN, 60, InetAddress.getByName("192.0.2.53")), Section.ADDITIONAL);

    DnsQueryResult result = DnsjavaWireClient.mapResponse("example.com.", "MX", 17, message);

    assertThat(result.rcode()).isEqualTo("NOERROR");
    assertThat(result.flags()).isEqualTo(new DnsFlags(true, true, true, true, true));
    assertThat(result.answer()).singleElement().satisfies(record -> {
      assertThat(record.name()).isEqualTo("example.com.");
      assertThat(record.type()).isEqualTo("MX");
      assertThat(record.recordClass()).isEqualTo("IN");
      assertThat(record.ttl()).isEqualTo(300);
      assertThat(record.value()).isEqualTo("10 mail.example.com.");
      assertThat(record.fields()).containsEntry("priority", "10").containsEntry("target", "mail.example.com.");
    });
    assertThat(result.authority()).singleElement().extracting(DnsRecord::type).isEqualTo("NS");
    assertThat(result.additional()).singleElement().satisfies(record -> {
      assertThat(record.type()).isEqualTo("A");
      assertThat(record.value()).isEqualTo("192.0.2.53");
    });
  }

  @Test
  void builds_an_absolute_question_for_a_hostname_without_a_trailing_dot() throws Exception {
    Message request = DnsjavaWireClient.buildQuery("example.com", "A");

    assertThat(request.getQuestion().getName().isAbsolute()).isTrue();
    assertThat(request.getQuestion().getName().toString()).isEqualTo("example.com.");
  }

  @Test
  void maps_caa_and_soa_fields() throws Exception {
    Name owner = Name.fromString("example.com.");
    Message message = new Message();
    message.addRecord(new CAARecord(owner, DClass.IN, 3600, 0, "issue", "letsencrypt.org"), Section.ANSWER);
    message.addRecord(new SOARecord(owner, DClass.IN, 1800,
        Name.fromString("ns1.example.com."), Name.fromString("hostmaster.example.com."),
        2026071701L, 7200, 3600, 1209600, 300), Section.ANSWER);

    DnsQueryResult result = DnsjavaWireClient.mapResponse("example.com.", "SOA", 3, message);

    assertThat(result.answer()).extracting(DnsRecord::fields).anySatisfy(fields ->
        assertThat(fields).containsEntry("flags", "0").containsEntry("tag", "issue"));
    assertThat(result.answer()).extracting(DnsRecord::fields).anySatisfy(fields ->
        assertThat(fields).containsEntry("primaryNameServer", "ns1.example.com.")
            .containsEntry("hostmaster", "hostmaster.example.com.")
            .containsEntry("serial", "2026071701")
            .containsEntry("refresh", "7200")
            .containsEntry("retry", "3600")
            .containsEntry("expire", "1209600")
            .containsEntry("minimum", "300"));
  }

  @Test
  void maps_service_text_and_dnssec_records_to_safe_structured_text_fields() throws Exception {
    Name owner = Name.fromString("example.com.");
    Message message = new Message();
    message.addRecord(new SRVRecord(Name.fromString("_sip._tcp.example.com."), DClass.IN, 120,
        10, 20, 5060, Name.fromString("sip.example.com.")), Section.ANSWER);
    message.addRecord(new TXTRecord(owner, DClass.IN, 180, List.of("v=spf1", "include:example.com")), Section.ANSWER);
    message.addRecord(new DNSKEYRecord(owner, DClass.IN, 300, 257, 3, 8, new byte[] {1, 2, 3}), Section.ANSWER);
    message.addRecord(new DSRecord(owner, DClass.IN, 300, 12345, 8, 2, new byte[] {10, 11, 12}), Section.ANSWER);
    message.addRecord(new RRSIGRecord(owner, DClass.IN, 300, Type.A, 8, 300,
        Instant.parse("2026-07-18T00:00:00Z"), Instant.parse("2026-07-17T00:00:00Z"),
        12345, Name.fromString("signer.example.com."), new byte[] {5, 6}), Section.ANSWER);

    DnsQueryResult result = DnsjavaWireClient.mapResponse("example.com.", "DNSKEY", 3, message);

    assertThat(result.answer()).extracting(DnsRecord::fields).anySatisfy(fields ->
        assertThat(fields).containsEntry("priority", "10").containsEntry("weight", "20")
            .containsEntry("port", "5060").containsEntry("target", "sip.example.com."));
    assertThat(result.answer()).extracting(DnsRecord::value).contains("v=spf1 include:example.com");
    assertThat(result.answer()).extracting(DnsRecord::fields).anySatisfy(fields ->
        assertThat(fields).containsEntry("key", "AQID"));
    assertThat(result.answer()).extracting(DnsRecord::fields).anySatisfy(fields ->
        assertThat(fields).containsEntry("digest", "0a0b0c"));
    assertThat(result.answer()).extracting(DnsRecord::fields).anySatisfy(fields ->
        assertThat(fields).containsEntry("signer", "signer.example.com.").containsEntry("signature", "BQY="));
  }

  @Test
  void makes_dns_dto_collections_immutable() {
    Map<String, String> sourceFields = new java.util.LinkedHashMap<>(Map.of("target", "ns1.example.com."));
    DnsRecord record = new DnsRecord("example.com.", "NS", "IN", 300, "ns1.example.com.", sourceFields);
    List<DnsRecord> sourceRecords = new ArrayList<>(List.of(record));
    DnsQueryResult query = new DnsQueryResult("example.com.", "NS", 1, "NOERROR", null, null,
        sourceRecords, sourceRecords, sourceRecords);
    DnsReport report = new DnsReport("example.com", DnsResolverChoice.SYSTEM, 1, 1, 1, List.of(query));

    sourceFields.put("target", "changed.example.com.");
    sourceRecords.clear();

    assertThat(record.fields()).containsEntry("target", "ns1.example.com.");
    assertThat(query.answer()).containsExactly(record);
    assertThatThrownBy(() -> record.fields().put("new", "value")).isInstanceOf(UnsupportedOperationException.class);
    assertThatThrownBy(() -> query.answer().add(record)).isInstanceOf(UnsupportedOperationException.class);
    assertThatThrownBy(() -> report.queries().add(query)).isInstanceOf(UnsupportedOperationException.class);
  }
}
