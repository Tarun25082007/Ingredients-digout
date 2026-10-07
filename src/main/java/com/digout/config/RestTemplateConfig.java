package com.digout.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class RestTemplateConfig {

    @Bean
    @org.springframework.context.annotation.Primary
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .setConnectTimeout(Duration.ofSeconds(10))
                .setReadTimeout(Duration.ofSeconds(300)) // Increased to 300s (5m) for Gemini API processing
                .defaultHeader("User-Agent", "DigoutApp/1.0 - Java - github.com/digout")
                .build();
    }

    @Bean(name = "fastRestTemplate")
    public RestTemplate fastRestTemplate(RestTemplateBuilder builder) {
        return builder
                .setConnectTimeout(Duration.ofSeconds(4))
                .setReadTimeout(Duration.ofSeconds(8)) // 8s timeout for external databases (OpenFoodFacts) to prevent 504 Gateway Timeout
                .defaultHeader("User-Agent", "IngredientDigoutApp/1.0 (contact@digout.app)")
                .build();
    }
}
