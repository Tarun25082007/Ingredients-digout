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

    private static final int MAX_CACHE_SIZE = 10000;
    private final ConcurrentHashMap<String, Bucket> cache = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // Never rate limit CORS preflight requests
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String key;
        
        // Differentiate by User ID (username/email) if authenticated, otherwise use client IP
        if (auth != null && auth.isAuthenticated() && !auth.getPrincipal().equals("anonymousUser")) {
            key = auth.getName();
        } else {
            key = getClientIp(request);
        }

        // Prevent memory leak if map grows beyond safety limit
        if (cache.size() > MAX_CACHE_SIZE) {
            cache.clear();
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

    private String getClientIp(HttpServletRequest request) {
        String cfIp = request.getHeader("CF-Connecting-IP");
        if (cfIp != null && !cfIp.isBlank()) {
            return cfIp.trim();
        }

        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            // May contain multiple comma-separated IPs: client, proxy1, proxy2...
            String[] ips = xForwardedFor.split(",");
            if (ips.length > 0 && !ips[0].isBlank()) {
                return ips[0].trim();
            }
        }

        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isBlank()) {
            return xRealIp.trim();
        }

        return request.getRemoteAddr();
    }

    private Bucket createNewBucket(String key) {
        // 60 requests per minute to accommodate autocomplete typing
        Bandwidth limit = Bandwidth.builder()
                .capacity(60)
                .refillIntervally(60, Duration.ofMinutes(1))
                .build();
        return Bucket.builder().addLimit(limit).build();
    }
}
