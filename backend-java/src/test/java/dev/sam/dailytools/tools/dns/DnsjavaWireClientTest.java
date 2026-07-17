package dev.sam.dailytools.tools.dns;

import org.junit.jupiter.api.Test;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.CAARecord;
import org.xbill.DNS.DClass;
import org.xbill.DNS.Flags;
import org.xbill.DNS.MXRecord;
import org.xbill.DNS.Message;
import org.xbill.DNS.NSRecord;
import org.xbill.DNS.Name;
import org.xbill.DNS.Rcode;
import org.xbill.DNS.SOARecord;
import org.xbill.DNS.Section;

import java.net.InetAddress;

import static org.assertj.core.api.Assertions.assertThat;

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
}
