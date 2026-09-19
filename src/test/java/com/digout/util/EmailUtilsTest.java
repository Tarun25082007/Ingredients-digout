package com.digout.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class EmailUtilsTest {

    @Test
    void testNullAndBlank() {
        assertEquals("", EmailUtils.canonicalize(null));
        assertEquals("", EmailUtils.canonicalize(""));
        assertEquals("", EmailUtils.canonicalize("   "));
    }

    @Test
    void testGmailExact() {
        assertEquals("user@gmail.com", EmailUtils.canonicalize("user@gmail.com"));
        assertEquals("user@gmail.com", EmailUtils.canonicalize("USER@GMAIL.COM"));
        assertEquals("user@gmail.com", EmailUtils.canonicalize("   user@gmail.com   "));
    }

    @Test
    void testGmailDotsRemoved() {
        assertEquals("gopitarun1978@gmail.com", EmailUtils.canonicalize("gopi.tarun1978@gmail.com"));
        assertEquals("gopitarun1978@gmail.com", EmailUtils.canonicalize("g.o.p.i.t.a.r.u.n.1.9.7.8@gmail.com"));
    }

    @Test
    void testGmailPlusAliasRemoved() {
        assertEquals("gopitarun1978@gmail.com", EmailUtils.canonicalize("gopitarun1978+newsletter@gmail.com"));
        assertEquals("gopitarun1978@gmail.com", EmailUtils.canonicalize("gopi.tarun1978+test@gmail.com"));
        assertEquals("gopitarun1978@gmail.com", EmailUtils.canonicalize("gopi.tarun.1978+anything+more@gmail.com"));
    }

    @Test
    void testGooglemailDomainNormalized() {
        assertEquals("gopitarun1978@gmail.com", EmailUtils.canonicalize("gopi.tarun1978@googlemail.com"));
        assertEquals("gopitarun1978@gmail.com", EmailUtils.canonicalize("gopitarun1978+tag@googlemail.com"));
    }

    @Test
    void testNonGmailDomainDotsPreserved() {
        assertEquals("john.doe@yahoo.com", EmailUtils.canonicalize("john.doe@yahoo.com"));
        assertEquals("alice.bob@company.org", EmailUtils.canonicalize("alice.bob@company.org"));
        assertEquals("user.name@outlook.com", EmailUtils.canonicalize("user.name@outlook.com"));
    }
}
