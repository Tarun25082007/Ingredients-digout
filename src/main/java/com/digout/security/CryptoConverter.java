package com.digout.security;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.Key;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Arrays;

/**
 * JPA AttributeConverter that transparently encrypts/decrypts a String column
 * using AES-256-GCM. A fresh 12-byte IV is generated for every encryption so
 * the same plain-text never produces the same cipher-text.
 * The stored value is: Base64( IV(12 bytes) || GCM-ciphertext+tag ).
 */
@Converter
public class CryptoConverter implements AttributeConverter<String, String> {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128; // bits
    private static final byte[] FALLBACK_KEY = "DigoutSecKey2026DigoutSecKey2026".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    private static final byte[] SECRET_KEY = getSecretKey();

    private static byte[] getSecretKey() {
        String envKey = System.getenv("DB_ENCRYPTION_KEY");
        if (envKey == null || envKey.isBlank()) {
            envKey = System.getProperty("DB_ENCRYPTION_KEY");
        }
        if (envKey != null && envKey.length() >= 32) {
            return envKey.substring(0, 32).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }
        return FALLBACK_KEY;
    }

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Override
    public String convertToDatabaseColumn(String rawData) {
        if (rawData == null) return null;
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            SECURE_RANDOM.nextBytes(iv);

            Key key = new SecretKeySpec(SECRET_KEY, "AES");
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] ciphertext = cipher.doFinal(rawData.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            // Prepend IV so it is available at decryption time
            byte[] combined = new byte[GCM_IV_LENGTH + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, GCM_IV_LENGTH);
            System.arraycopy(ciphertext, 0, combined, GCM_IV_LENGTH, ciphertext.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("Error encrypting field", e);
        }
    }

    @Override
    public String convertToEntityAttribute(String encryptedData) {
        if (encryptedData == null || encryptedData.isBlank()) return encryptedData;
        try {
            return decryptWithKey(encryptedData, SECRET_KEY);
        } catch (Exception e) {
            // If primary key fails, try fallback key (handles data encrypted with previous default key)
            if (!Arrays.equals(SECRET_KEY, FALLBACK_KEY)) {
                try {
                    return decryptWithKey(encryptedData, FALLBACK_KEY);
                } catch (Exception ignored) {}
            }
            // Graceful fallback: treat as legacy plaintext (e.g. "None", unencrypted strings)
            return encryptedData;
        }
    }

    private String decryptWithKey(String encryptedData, byte[] keyBytes) throws Exception {
        byte[] combined = Base64.getDecoder().decode(encryptedData);
        // Minimum valid GCM payload: 12-byte IV + 16-byte authentication tag = 28 bytes
        if (combined.length < GCM_IV_LENGTH + 16) {
            throw new IllegalArgumentException("Payload too short for AES-GCM IV and authentication tag");
        }
        byte[] iv = Arrays.copyOfRange(combined, 0, GCM_IV_LENGTH);
        byte[] ciphertext = Arrays.copyOfRange(combined, GCM_IV_LENGTH, combined.length);

        Key key = new SecretKeySpec(keyBytes, "AES");
        Cipher cipher = Cipher.getInstance(ALGORITHM);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
        return new String(cipher.doFinal(ciphertext), java.nio.charset.StandardCharsets.UTF_8);
    }
}
