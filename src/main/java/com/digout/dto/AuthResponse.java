package com.digout.dto;

public record AuthResponse(
        String token,
        UserProfileDTO user
) {
    public AuthResponse(String token) {
        this(token, null);
    }
}
