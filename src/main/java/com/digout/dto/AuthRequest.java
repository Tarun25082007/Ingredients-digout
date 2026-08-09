package com.digout.dto;

public record AuthRequest(
        String email,
        String password
) {}
