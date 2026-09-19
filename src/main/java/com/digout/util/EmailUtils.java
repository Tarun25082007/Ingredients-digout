package com.digout.util;

public final class EmailUtils {

    private EmailUtils() {}

    /**
     * Canonicalizes an email address.
     * For Gmail / Googlemail addresses:
     * 1. Strips all dots in the username part (e.g., "first.last" -> "firstlast").
     * 2. Strips plus-addressing / aliases (e.g., "user+tag" -> "user").
     * 3. Normalizes domain "googlemail.com" to "gmail.com".
     *
     * For all email domains:
     * 1. Trims leading and trailing whitespace.
     * 2. Converts to lowercase.
     */
    public static String canonicalize(String email) {
        if (email == null || email.isBlank()) {
            return "";
        }
        String trimmed = email.trim().toLowerCase();
        int atIndex = trimmed.lastIndexOf('@');
        if (atIndex <= 0 || atIndex == trimmed.length() - 1) {
            return trimmed;
        }

        String local = trimmed.substring(0, atIndex);
        String domain = trimmed.substring(atIndex + 1);

        if ("gmail.com".equals(domain) || "googlemail.com".equals(domain)) {
            int plusIndex = local.indexOf('+');
            if (plusIndex >= 0) {
                local = local.substring(0, plusIndex);
            }
            local = local.replace(".", "");
            domain = "gmail.com";
        }

        return local + "@" + domain;
    }
}
