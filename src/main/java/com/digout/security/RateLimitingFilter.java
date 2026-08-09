package com.digout.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitingFilter extends OncePerRequestFilter {

    private final ConcurrentHashMap<String, Bucket> cache = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String key;
        
        // Differentiate by User ID (username/email) if authenticated, otherwise use IP address
        if (auth != null && auth.isAuthenticated() && !auth.getPrincipal().equals("anonymousUser")) {
            key = auth.getName();
        } else {
            key = request.getRemoteAddr();
        }
        
        Bucket bucket = cache.computeIfAbsent(key, this::createNewBucket);

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            response.setStatus(429); // HTTP 429 Too Many Requests
            response.setContentType("application/json");
            response.getWriter().write("{\"error\": \"Rate limit exceeded. Please wait 1 minute.\"}");
        }
    }

    private Bucket createNewBucket(String key) {
        // Strict rule: 1 request per 60 seconds.
        // Support for Bucket4j v8.x API as well as older syntax using classic.
        // Assuming Bucket4j 8+ API:
        Bandwidth limit = Bandwidth.builder()
                .capacity(1)
                .refillIntervally(1, Duration.ofSeconds(60))
                .build();
        return Bucket.builder().addLimit(limit).build();
    }
}
