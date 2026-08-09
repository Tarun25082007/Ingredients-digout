package com.digout.dto;

public record RegisterRequest(
        String email,
        String password,
        String name
) {}
