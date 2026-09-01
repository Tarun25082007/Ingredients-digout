package com.digout.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

public record RegisterRequest(
        String email,
        String password,
        @JsonAlias({"fullName", "name"})
        String name
) {}
